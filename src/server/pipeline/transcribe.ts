import type {Word} from '@/remotion/types';
import {ProviderError} from './errors';
import {Gemini, S, type Part} from './gemini';

export {ProviderError};

// ---------- Gemini transcription with word timings ----------
// The 16 kHz mono WAV from the browser is split into ~75 s chunks at the quietest moment near each
// boundary, so a cut never lands mid-word and timings stay tight on long recordings.

const CHUNK_SEC = 75;
const SEARCH_SEC = 5;
const CONCURRENCY = 3;

const SYSTEM =
	'You are a verbatim transcriber for a video editor. Transcribe exactly what is spoken, word by word, in the spoken language. ' +
	'Keep every filler word (um, uh, like), false start, stutter and repeated take: the editor needs them to choose cuts. Never summarize, fix or translate. ' +
	'Attach punctuation to the word before it. Give each word its start and end time in seconds from the start of this audio, as precisely as you can (two decimals). ' +
	'Return an empty list if nobody speaks.';

const SCHEMA = S.obj({
	words: S.arr(S.obj({w: S.str('the word with its punctuation'), s: S.num('start, seconds'), e: S.num('end, seconds')})),
});

type Wav = {rate: number; samples: Int16Array};

export function parseWav(buf: Buffer): Wav | null {
	if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
	let off = 12;
	let rate = 16000;
	let bits = 16;
	let channels = 1;
	while (off + 8 <= buf.length) {
		const id = buf.toString('ascii', off, off + 4);
		const size = buf.readUInt32LE(off + 4);
		if (id === 'fmt ') {
			channels = buf.readUInt16LE(off + 10);
			rate = buf.readUInt32LE(off + 12);
			bits = buf.readUInt16LE(off + 22);
		} else if (id === 'data') {
			if (bits !== 16 || channels !== 1) return null;
			const end = Math.min(buf.length, off + 8 + size);
			const copy = Buffer.from(buf.subarray(off + 8, end - ((end - off - 8) % 2)));
			return {rate, samples: new Int16Array(copy.buffer, copy.byteOffset, copy.length / 2)};
		}
		off += 8 + size + (size % 2);
	}
	return null;
}

export function encodeWav({rate, samples}: Wav): Buffer {
	const b = Buffer.alloc(44 + samples.length * 2);
	b.write('RIFF', 0, 'ascii');
	b.writeUInt32LE(36 + samples.length * 2, 4);
	b.write('WAVEfmt ', 8, 'ascii');
	b.writeUInt32LE(16, 16);
	b.writeUInt16LE(1, 20);
	b.writeUInt16LE(1, 22);
	b.writeUInt32LE(rate, 24);
	b.writeUInt32LE(rate * 2, 28);
	b.writeUInt16LE(2, 32);
	b.writeUInt16LE(16, 34);
	b.write('data', 36, 'ascii');
	b.writeUInt32LE(samples.length * 2, 40);
	Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength).copy(b, 44);
	return b;
}

// Chunk boundaries (sample indices), each moved to the quietest 20 ms window within ±5 s of the target.
export function chunkBounds({rate, samples}: Wav, chunkSec = CHUNK_SEC): number[] {
	const n = samples.length;
	const bounds = [0];
	const win = Math.round(rate * 0.02);
	let target = rate * chunkSec;
	while (target < n - rate * 10) {
		let best = target;
		let bestE = Infinity;
		for (let s = Math.max(bounds[bounds.length - 1] + win, target - rate * SEARCH_SEC); s < Math.min(n - win, target + rate * SEARCH_SEC); s += win) {
			let e = 0;
			for (let i = s; i < s + win; i++) e += samples[i] * samples[i];
			if (e < bestE) {
				bestE = e;
				best = s + Math.round(win / 2);
			}
		}
		bounds.push(best);
		target = best + rate * chunkSec;
	}
	bounds.push(n);
	return bounds;
}

// Cleans one chunk's words: drops empties, clamps to the chunk, keeps times increasing and non-overlapping.
export function cleanWords(raw: {w?: unknown; s?: unknown; e?: unknown}[], durSec: number, offsetSec = 0): Word[] {
	const list = raw
		.map((r) => ({text: String(r.w ?? '').trim(), s: Number(r.s), e: Number(r.e)}))
		.filter((r) => r.text && Number.isFinite(r.s))
		.map((r) => ({...r, s: Math.min(durSec, Math.max(0, r.s)), e: Number.isFinite(r.e) ? Math.min(durSec, Math.max(0, r.e)) : r.s}));
	const out: Word[] = [];
	let prev = 0;
	for (let i = 0; i < list.length; i++) {
		const s = Math.max(prev, list[i].s);
		const nextS = i + 1 < list.length ? Math.max(s, list[i + 1].s) : durSec;
		let e = Math.max(list[i].e, s + 0.06);
		if (e > nextS && nextS > s) e = nextS;
		out.push({text: list[i].text, startMs: Math.round((s + offsetSec) * 1000), endMs: Math.round((Math.min(e, durSec) + offsetSec) * 1000)});
		prev = s;
	}
	return out;
}

async function pool<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({length: Math.min(limit, items.length)}, async () => {
			while (next < items.length) {
				const i = next++;
				out[i] = await fn(items[i], i);
			}
		}),
	);
	return out;
}

const keyError = (e: unknown) => e instanceof ProviderError && /rejected your API key|rate-limited/.test(e.message);

// Flash first (fast and cheap); if it fails or returns nothing usable, the Pro model tries once.
async function transcribePart(g: Gemini, parts: Part[], expectSpeech: boolean): Promise<{w?: unknown; s?: unknown; e?: unknown}[]> {
	let lastErr: unknown = null;
	for (const tier of ['flash', 'pro'] as const) {
		try {
			const r = await g.json<{words?: {w?: unknown; s?: unknown; e?: unknown}[]}>({model: await g.model(tier), system: SYSTEM, parts, schema: SCHEMA, maxTokens: 32768});
			const words = r.words ?? [];
			if (words.length || !expectSpeech || tier === 'pro') return words;
		} catch (e) {
			if (keyError(e)) throw e;
			lastErr = e;
		}
	}
	throw lastErr ?? new ProviderError('Gemini could not transcribe this video.');
}

const rms = (s: Int16Array) => {
	let e = 0;
	for (let i = 0; i < s.length; i += 4) e += s[i] * s[i];
	return Math.sqrt(e / Math.max(1, s.length / 4));
};

export async function transcribeGeminiAudio(audio: Buffer, apiKey: string): Promise<Word[]> {
	const wav = parseWav(audio);
	if (!wav) throw new ProviderError('The extracted audio is not a 16-bit mono WAV.');
	const g = new Gemini(apiKey);
	const bounds = chunkBounds(wav);
	const chunks = bounds.slice(0, -1).map((a, i) => ({a, b: bounds[i + 1]}));
	const results = await pool(chunks, CONCURRENCY, async ({a, b}) => {
		const samples = wav.samples.subarray(a, b);
		const durSec = samples.length / wav.rate;
		const data = encodeWav({rate: wav.rate, samples}).toString('base64');
		const raw = await transcribePart(g, [{inlineData: {mimeType: 'audio/wav', data}}, {text: `Transcribe this ${durSec.toFixed(1)} second audio clip.`}], rms(samples) > 200);
		return cleanWords(raw, durSec, a / wav.rate);
	});
	return results.flat();
}

// When the browser could not extract audio, Gemini listens to the uploaded video instead.
export async function transcribeGeminiVideo(video: Buffer, mimeType: string, durationSec: number, apiKey: string): Promise<Word[]> {
	const g = new Gemini(apiKey);
	const file = await g.upload(video, mimeType, 'cutline-source');
	try {
		const raw = await transcribePart(g, [{fileData: {fileUri: file.uri, mimeType: file.mimeType}}, {text: `Transcribe the speech in this ${durationSec.toFixed(1)} second video.`}], true);
		return cleanWords(raw, durationSec);
	} finally {
		await g.remove(file);
	}
}
