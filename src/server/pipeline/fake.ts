// Development only (CUTLINE_FAKE_AI=1): stands in for the transcription and planning APIs so the
// whole pipeline, including the real render, can be exercised without spending provider credits.
import type {Word} from '@/remotion/types';
import {toPlan} from './plan';

const TEXT =
	'Most creators edit videos the hard way. They waste hours on captions. But what if every single word just popped on screen? ' +
	'That is exactly what we are building. Upload a clip, pick a style, and get the short back in minutes.';

export function fakeTranscript(durationSec: number): Word[] {
	const words = TEXT.split(' ');
	const out: Word[] = [];
	let t = 400;
	const end = durationSec * 1000 - 300;
	let i = 0;
	while (t < end) {
		const text = words[i % words.length];
		const len = 180 + text.length * 45;
		out.push({text, startMs: Math.round(t), endMs: Math.round(Math.min(end, t + len))});
		// sentence pause long enough to be cut, plus a fake "um" retake now and then
		t += len + (/[.?!]$/.test(text) ? 900 : 60);
		i++;
	}
	return out;
}

export function fakePlan(words: Word[]) {
	const keywords = words.map((w, i) => (/^(hard|hours|every|popped|building|minutes)/i.test(w.text) ? i : -1)).filter((i) => i >= 0);
	const zooms = keywords.filter((_, k) => k % 2 === 0).map((at) => ({at, words: 3}));
	return toPlan({remove: [], keywords, zooms, hook: 'Captions in one click'}, words, 500);
}
