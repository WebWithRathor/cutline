import {ProviderError} from './errors';

// Minimal Gemini REST client: the File API for media, generateContent with a JSON response schema,
// and model discovery so new Gemini releases are picked up without a code change.

const BASE = 'https://generativelanguage.googleapis.com';

export type GeminiFile = {name: string; uri: string; mimeType: string};
export type Part = {text: string} | {fileData: {fileUri: string; mimeType: string}; videoMetadata?: {fps?: number}} | {inlineData: {mimeType: string; data: string}};

// A Gemini error the creator can act on, plus what the caller needs to decide whether to wait or switch model.
export class GeminiError extends ProviderError {
	constructor(
		message: string,
		readonly status: number,
		readonly retryAfterMs = 0,
		readonly quotaExhausted = false, // a hard quota (e.g. limit 0 on the free tier): waiting will not help
	) {
		super(message);
	}
}

type ErrorBody = {error?: {message?: string; status?: string; details?: {'@type'?: string; retryDelay?: string; violations?: {quotaId?: string; quotaMetric?: string}[]}[]}};

async function failure(res: Response, model?: string) {
	const body = await res.text().catch(() => '');
	let j: ErrorBody = {};
	try {
		j = JSON.parse(body) as ErrorBody;
	} catch {}
	const raw = j.error?.message ?? body.slice(0, 300);
	if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|API key not valid/i.test(body))
		return new GeminiError('Gemini rejected your API key. Replace it in API keys and try again.', res.status);
	if (res.status === 429) {
		const delay = j.error?.details?.find((d) => d.retryDelay)?.retryDelay;
		const retryAfterMs = delay ? Math.ceil(parseFloat(delay) * 1000) : 0;
		const perDay = /PerDay|per_day|daily/i.test(body);
		const zero = /limit:\s*0\b/.test(raw);
		const who = model ? ` for ${model}` : '';
		const why = zero
			? `your plan has no quota${who} (the free tier does not include it)`
			: perDay
				? `the daily quota${who} is used up`
				: `the per-minute limit${who} was hit`;
		return new GeminiError(`Gemini: ${why}.`, 429, retryAfterMs, zero || perDay);
	}
	if (res.status === 413) return new GeminiError('The video is too large for Gemini.', 413);
	return new GeminiError(`Gemini request failed (${res.status}): ${raw.slice(0, 240)}`, res.status, res.status >= 500 ? 5000 : 0);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// fetch that turns network failures (dropped connection, DNS, timeout) into a readable error.
async function call(url: string, init: RequestInit & {timeoutMs?: number} = {}): Promise<Response> {
	try {
		return await fetch(url, {...init, signal: AbortSignal.timeout(init.timeoutMs ?? 5 * 60 * 1000)});
	} catch (e) {
		const cause = (e as {cause?: {code?: string; message?: string}}).cause;
		const why = (e as Error).name === 'TimeoutError' ? 'it timed out' : (cause?.code ?? cause?.message ?? (e as Error).message ?? 'network error');
		throw new GeminiError(`Could not reach Gemini (${why}). Check your internet connection and try again.`, 0, 3000);
	}
}

// Ranks model ids like gemini-3.1-pro or gemini-2.5-flash-preview-09-2025: newest version first, stable before preview.
export function rankModels(names: string[], tier: 'pro' | 'flash'): string[] {
	const re = new RegExp(`^(?:models/)?(gemini-(\\d+(?:\\.\\d+)?)-${tier}(?:-(preview|exp)[\\w.-]*|-\\d{3})?)$`);
	return names
		.map((n) => re.exec(n))
		.filter((m): m is RegExpExecArray => Boolean(m))
		.sort((a, b) => Number(b[2]) - Number(a[2]) || Number(Boolean(a[3])) - Number(Boolean(b[3])) || a[1].length - b[1].length)
		.map((m) => m[1]);
}

const FALLBACK = {pro: 'gemini-2.5-pro', flash: 'gemini-2.5-flash'};

export class Gemini {
	private models: Promise<string[]> | null = null;
	constructor(private apiKey: string) {}

	private headers(extra: Record<string, string> = {}) {
		return {'x-goog-api-key': this.apiKey, ...extra};
	}

	private async listModels(): Promise<string[]> {
		const res = await call(`${BASE}/v1beta/models?pageSize=1000`, {headers: this.headers(), timeoutMs: 30000});
		if (!res.ok) throw await failure(res);
		const j = (await res.json()) as {models?: {name: string; supportedGenerationMethods?: string[]}[]};
		return (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
	}

	// GEMINI_MODEL / GEMINI_FAST_MODEL override; otherwise the newest Pro / Flash model this key can use.
	async model(tier: 'pro' | 'flash'): Promise<string> {
		const override = tier === 'pro' ? process.env.GEMINI_MODEL : process.env.GEMINI_FAST_MODEL;
		if (override) return override;
		this.models ??= this.listModels();
		return rankModels(await this.models, tier)[0] ?? FALLBACK[tier];
	}

	// Models to try in order: the best Pro models (stable before preview), then Flash, which has far more free quota.
	async candidates(): Promise<string[]> {
		if (process.env.GEMINI_MODEL) return [process.env.GEMINI_MODEL, ...(process.env.GEMINI_FAST_MODEL ? [process.env.GEMINI_FAST_MODEL] : [])];
		this.models ??= this.listModels();
		const names = await this.models;
		const byStable = (list: string[]) => [...list].sort((a, b) => Number(/preview|exp/.test(a)) - Number(/preview|exp/.test(b)));
		const pro = byStable(rankModels(names, 'pro').slice(0, 3)).slice(0, 2);
		const flash = byStable(rankModels(names, 'flash').slice(0, 2)).slice(0, 1);
		const list = [...pro, ...(process.env.GEMINI_FAST_MODEL ? [process.env.GEMINI_FAST_MODEL] : flash)];
		return list.length ? [...new Set(list)] : [FALLBACK.pro, FALLBACK.flash];
	}

	// Resumable upload (retried once if the connection drops), then wait until the file is processed.
	async upload(bytes: Buffer, mimeType: string, displayName: string, onWait?: (seconds: number) => void): Promise<GeminiFile> {
		let file: {name: string; uri: string; mimeType: string; state?: string; error?: {message?: string}} | undefined;
		for (let attempt = 1; !file; attempt++) {
			try {
				const start = await call(`${BASE}/upload/v1beta/files`, {
					method: 'POST',
					headers: this.headers({
						'X-Goog-Upload-Protocol': 'resumable',
						'X-Goog-Upload-Command': 'start',
						'X-Goog-Upload-Header-Content-Length': String(bytes.length),
						'X-Goog-Upload-Header-Content-Type': mimeType,
						'Content-Type': 'application/json',
					}),
					body: JSON.stringify({file: {display_name: displayName}}),
					timeoutMs: 60000,
				});
				if (!start.ok) throw await failure(start);
				const url = start.headers.get('x-goog-upload-url');
				if (!url) throw new GeminiError('Gemini did not accept the upload.', 0);
				const res = await call(url, {
					method: 'POST',
					headers: {'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize', 'Content-Length': String(bytes.length)},
					body: new Uint8Array(bytes),
					timeoutMs: 15 * 60 * 1000,
				});
				if (!res.ok) throw await failure(res);
				file = ((await res.json()) as {file: NonNullable<typeof file>}).file;
			} catch (e) {
				if (attempt >= 2 || !(e instanceof GeminiError) || (e.status !== 0 && e.status < 500)) throw e;
				await sleep(3000);
			}
		}
		let f = file;
		const started = Date.now();
		while (f.state === 'PROCESSING') {
			if (Date.now() - started > 10 * 60 * 1000) throw new GeminiError('Gemini took too long to process the video.', 0);
			await sleep(3000);
			onWait?.(Math.round((Date.now() - started) / 1000));
			const r = await call(`${BASE}/v1beta/${f.name}`, {headers: this.headers(), timeoutMs: 30000});
			if (!r.ok) throw await failure(r);
			f = await r.json();
		}
		if (f.state === 'FAILED') throw new GeminiError(`Gemini could not read this file. ${f.error?.message ?? ''}`.trim(), 0);
		return {name: f.name, uri: f.uri, mimeType: f.mimeType || mimeType};
	}

	// Still usable? Uploaded files live 48 hours.
	async exists(file: GeminiFile): Promise<boolean> {
		const r = await call(`${BASE}/v1beta/${file.name}`, {headers: this.headers(), timeoutMs: 30000}).catch(() => null);
		if (!r?.ok) return false;
		return ((await r.json()) as {state?: string}).state === 'ACTIVE';
	}

	async remove(file: GeminiFile) {
		await call(`${BASE}/v1beta/${file.name}`, {method: 'DELETE', headers: this.headers(), timeoutMs: 30000}).catch(() => undefined);
	}

	// One generateContent call constrained to a JSON schema.
	async json<T>(opts: {model: string; system: string; parts: Part[]; schema: object; maxTokens?: number; lowMediaRes?: boolean}): Promise<T> {
		const res = await call(`${BASE}/v1beta/models/${opts.model}:generateContent`, {
			method: 'POST',
			headers: this.headers({'Content-Type': 'application/json'}),
			body: JSON.stringify({
				systemInstruction: {parts: [{text: opts.system}]},
				contents: [{role: 'user', parts: opts.parts}],
				generationConfig: {
					responseMimeType: 'application/json',
					responseSchema: opts.schema,
					maxOutputTokens: opts.maxTokens ?? 16384,
					temperature: 0.4,
					...(opts.lowMediaRes ? {mediaResolution: 'MEDIA_RESOLUTION_LOW'} : {}),
				},
			}),
			timeoutMs: 10 * 60 * 1000,
		});
		if (!res.ok) throw await failure(res, opts.model);
		const j = (await res.json()) as {
			candidates?: {content?: {parts?: {text?: string; thought?: boolean}[]}; finishReason?: string}[];
			promptFeedback?: {blockReason?: string};
		};
		if (j.promptFeedback?.blockReason) throw new GeminiError(`Gemini declined this video (${j.promptFeedback.blockReason}).`, 0);
		const c = j.candidates?.[0];
		const text = (c?.content?.parts ?? [])
			.filter((p) => !p.thought)
			.map((p) => p.text ?? '')
			.join('');
		try {
			return JSON.parse(text) as T;
		} catch {
			throw new GeminiError(`Gemini returned an unreadable answer${c?.finishReason && c.finishReason !== 'STOP' ? ` (${c.finishReason})` : ''}.`, 0);
		}
	}
}

// Gemini's schema dialect (OpenAPI subset) built from small helpers.
export const S = {
	str: (description?: string, e?: readonly string[]) => ({type: 'STRING', ...(description ? {description} : {}), ...(e ? {enum: [...e]} : {})}),
	num: (description?: string) => ({type: 'NUMBER', ...(description ? {description} : {})}),
	arr: (items: object, description?: string) => ({type: 'ARRAY', items, ...(description ? {description} : {})}),
	obj: (properties: Record<string, object>, required = Object.keys(properties)) => ({type: 'OBJECT', properties, required, propertyOrdering: Object.keys(properties)}),
};
