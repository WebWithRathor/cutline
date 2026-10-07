import {readFile} from 'node:fs/promises';
import type {Word} from '@/remotion/types';

export class ProviderError extends Error {}

const keyRejected = (name: string) => new ProviderError(`${name} rejected your API key. Replace it in API keys and try again.`);

async function failure(res: Response, name: string) {
	if (res.status === 401 || res.status === 403) return keyRejected(name);
	if (res.status === 429) return new ProviderError(`${name} rate-limited the request or your account is out of credit.`);
	const body = await res.text().catch(() => '');
	return new ProviderError(`${name} transcription failed (${res.status}). ${body.slice(0, 200)}`);
}

// ---------- Deepgram: punctuated words with timestamps in one call ----------
export async function transcribeDeepgram(audioPath: string, apiKey: string): Promise<Word[]> {
	const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&detect_language=true', {
		method: 'POST',
		headers: {Authorization: `Token ${apiKey}`, 'Content-Type': 'audio/mpeg'},
		body: await readFile(audioPath),
	});
	if (!res.ok) throw await failure(res, 'Deepgram');
	const j = (await res.json()) as {
		results?: {channels?: {alternatives?: {words?: {word: string; punctuated_word?: string; start: number; end: number}[]}[]}[]};
	};
	const words = j.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
	return words.map((w) => ({text: w.punctuated_word ?? w.word, startMs: Math.round(w.start * 1000), endMs: Math.round(w.end * 1000)}));
}

// ---------- OpenAI Whisper: word timestamps come without punctuation, so we borrow it from segment text ----------
export async function transcribeOpenAI(audioPath: string, apiKey: string): Promise<Word[]> {
	const form = new FormData();
	form.append('file', new Blob([await readFile(audioPath)], {type: 'audio/mpeg'}), 'audio.mp3');
	form.append('model', 'whisper-1');
	form.append('response_format', 'verbose_json');
	form.append('timestamp_granularities[]', 'word');
	form.append('timestamp_granularities[]', 'segment');
	const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
		method: 'POST',
		headers: {Authorization: `Bearer ${apiKey}`},
		body: form,
	});
	if (!res.ok) throw await failure(res, 'OpenAI');
	const j = (await res.json()) as {words?: {word: string; start: number; end: number}[]; segments?: {text: string}[]};
	const raw = j.words ?? [];
	const punctuated = (j.segments ?? []).flatMap((s) => s.text.trim().split(/\s+/)).filter(Boolean);
	return alignPunctuation(raw, punctuated);
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// Walks both token lists in order; when a punctuated token matches the bare word, use the punctuated form.
export function alignPunctuation(words: {word: string; start: number; end: number}[], punctuated: string[]): Word[] {
	let j = 0;
	return words.map((w) => {
		const target = norm(w.word);
		let text = w.word.trim();
		for (let look = j; look < Math.min(punctuated.length, j + 4); look++) {
			if (norm(punctuated[look]) === target) {
				text = punctuated[look];
				j = look + 1;
				break;
			}
		}
		return {text, startMs: Math.round(w.start * 1000), endMs: Math.round(w.end * 1000)};
	});
}
