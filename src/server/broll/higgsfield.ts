import {ProviderError} from '@/server/pipeline/errors';

// Higgsfield text-to-video for AI B-roll. Requests are queued: submit, then poll the status URL until the
// clip is ready. The model path is configurable because Higgsfield adds models often.
// Key format: KEY_ID:KEY_SECRET.

const BASE = (process.env.HIGGSFIELD_API_BASE || 'https://platform.higgsfield.ai').replace(/\/$/, '');
const MODEL = process.env.HIGGSFIELD_MODEL || 'bytedance/seedance-2.0/text-to-video';

type Status = {
	status?: string;
	request_id?: string;
	status_url?: string;
	error?: string;
	video?: {url?: string};
	videos?: {url?: string}[];
	output?: {url?: string} | {url?: string}[];
};

async function failure(res: Response) {
	if (res.status === 401 || res.status === 403) return new ProviderError('Higgsfield rejected your API key. Replace it in API keys.');
	if (res.status === 402) return new ProviderError('Your Higgsfield account is out of credits.');
	if (res.status === 429) return new ProviderError('Higgsfield rate-limited the request.');
	return new ProviderError(`Higgsfield request failed (${res.status}). ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

const videoUrl = (s: Status) => s.video?.url ?? s.videos?.[0]?.url ?? (Array.isArray(s.output) ? s.output[0]?.url : s.output?.url);

export const aspectFor = (w: number, h: number) => (w / h < 0.8 ? '9:16' : w / h > 1.25 ? '16:9' : '1:1');

export async function generateClip(opts: {apiKey: string; prompt: string; seconds: number; aspect: string; signal?: AbortSignal}): Promise<string> {
	const headers = {Authorization: `Key ${opts.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json'};
	const res = await fetch(`${BASE}/${MODEL}`, {
		method: 'POST',
		headers,
		body: JSON.stringify({prompt: opts.prompt, duration: Math.min(15, Math.max(4, Math.ceil(opts.seconds))), aspect_ratio: opts.aspect, resolution: '720p', generate_audio: false}),
		signal: opts.signal,
	});
	if (!res.ok) throw await failure(res);
	let s = (await res.json()) as Status;
	const statusUrl = s.status_url ?? (s.request_id ? `${BASE}/requests/${s.request_id}/status` : null);
	const deadline = Date.now() + 15 * 60 * 1000;
	while (!videoUrl(s) || !['completed', 'COMPLETED', undefined].includes(s.status)) {
		if (s.status && /fail|nsfw|cancel/i.test(s.status)) throw new ProviderError(`Higgsfield could not make this clip (${s.status}${s.error ? `: ${s.error.slice(0, 120)}` : ''}).`);
		if (!statusUrl) throw new ProviderError('Higgsfield returned no request id.');
		if (Date.now() > deadline) throw new ProviderError('Higgsfield took too long.');
		await new Promise((r) => setTimeout(r, 5000));
		const r = await fetch(statusUrl, {headers, signal: opts.signal});
		if (!r.ok) throw await failure(r);
		s = await r.json();
	}
	return videoUrl(s)!;
}
