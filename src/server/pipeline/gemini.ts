import {ProviderError} from './errors';

// Minimal Gemini REST client: the File API for media, generateContent with a JSON response schema,
// and model discovery so new Gemini releases are picked up without a code change.

const BASE = 'https://generativelanguage.googleapis.com';

export type GeminiFile = {name: string; uri: string; mimeType: string};
export type Part = {text: string} | {fileData: {fileUri: string; mimeType: string}; videoMetadata?: {fps?: number}} | {inlineData: {mimeType: string; data: string}};

async function failure(res: Response) {
	const body = await res.text().catch(() => '');
	if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|API key not valid/i.test(body))
		return new ProviderError('Gemini rejected your API key. Replace it in API keys and try again.');
	if (res.status === 429) return new ProviderError('Gemini rate-limited the request or your quota is used up. Wait a minute and try again.');
	let msg = body.slice(0, 240);
	try {
		msg = (JSON.parse(body) as {error?: {message?: string}}).error?.message?.slice(0, 240) ?? msg;
	} catch {}
	return new ProviderError(`Gemini request failed (${res.status}). ${msg}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
		const res = await fetch(`${BASE}/v1beta/models?pageSize=1000`, {headers: this.headers()});
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

	// Resumable upload, then wait until the file is processed (videos take a while).
	async upload(bytes: Buffer, mimeType: string, displayName: string, onWait?: (seconds: number) => void): Promise<GeminiFile> {
		const start = await fetch(`${BASE}/upload/v1beta/files`, {
			method: 'POST',
			headers: this.headers({
				'X-Goog-Upload-Protocol': 'resumable',
				'X-Goog-Upload-Command': 'start',
				'X-Goog-Upload-Header-Content-Length': String(bytes.length),
				'X-Goog-Upload-Header-Content-Type': mimeType,
				'Content-Type': 'application/json',
			}),
			body: JSON.stringify({file: {display_name: displayName}}),
		});
		if (!start.ok) throw await failure(start);
		const url = start.headers.get('x-goog-upload-url');
		if (!url) throw new ProviderError('Gemini did not accept the upload.');
		const res = await fetch(url, {
			method: 'POST',
			headers: {'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize', 'Content-Length': String(bytes.length)},
			body: new Uint8Array(bytes),
		});
		if (!res.ok) throw await failure(res);
		let file = ((await res.json()) as {file: {name: string; uri: string; mimeType: string; state?: string; error?: {message?: string}}}).file;
		const deadline = Date.now() + 10 * 60 * 1000;
		while (file.state === 'PROCESSING') {
			if (Date.now() > deadline) throw new ProviderError('Gemini took too long to process the video.');
			await sleep(3000);
			onWait?.(Math.round((Date.now() - deadline) / 1000 + 600));
			const r = await fetch(`${BASE}/v1beta/${file.name}`, {headers: this.headers()});
			if (!r.ok) throw await failure(r);
			file = await r.json();
		}
		if (file.state === 'FAILED') throw new ProviderError(`Gemini could not read this file. ${file.error?.message ?? ''}`.trim());
		return {name: file.name, uri: file.uri, mimeType: file.mimeType || mimeType};
	}

	async remove(file: GeminiFile) {
		await fetch(`${BASE}/v1beta/${file.name}`, {method: 'DELETE', headers: this.headers()}).catch(() => undefined);
	}

	// One generateContent call constrained to a JSON schema.
	async json<T>(opts: {model: string; system: string; parts: Part[]; schema: object; maxTokens?: number; lowMediaRes?: boolean}): Promise<T> {
		const res = await fetch(`${BASE}/v1beta/models/${opts.model}:generateContent`, {
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
		});
		if (!res.ok) throw await failure(res);
		const j = (await res.json()) as {
			candidates?: {content?: {parts?: {text?: string; thought?: boolean}[]}; finishReason?: string}[];
			promptFeedback?: {blockReason?: string};
		};
		if (j.promptFeedback?.blockReason) throw new ProviderError(`Gemini declined this video (${j.promptFeedback.blockReason}).`);
		const c = j.candidates?.[0];
		const text = (c?.content?.parts ?? [])
			.filter((p) => !p.thought)
			.map((p) => p.text ?? '')
			.join('');
		try {
			return JSON.parse(text) as T;
		} catch {
			throw new ProviderError(`Gemini returned an unreadable answer${c?.finishReason && c.finishReason !== 'STOP' ? ` (${c.finishReason})` : ''}.`);
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
