// Development only (CUTLINE_FAKE_AI=1): stands in for the transcription and planning APIs so the
// whole pipeline, including the real render, can be exercised without spending provider credits.
import type {Word} from '@/remotion/types';
import {toPlan} from './plan';
import {sanitizeShots} from './plan-kids';

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

// Dev-only kids plan: exercises every beat type on whatever transcript exists.
export function fakeKidsPlan(words: Word[]) {
	const n = words.length;
	const at = (f: number) => Math.min(n - 1, Math.max(0, Math.round(n * f)));
	const keywords = words.map((w, i) => (/^(hard|hours|every|popped|building|minutes|captions|style)/i.test(w.text) ? i : -1)).filter((i) => i >= 0);
	const base = toPlan({remove: [], keywords}, words, 1200);
	return {
		...base,
		zooms: [],
		shots: sanitizeShots(
			[
				{kind: 'camera', startWord: 0, zoom: [1, 1.05], why: 'Hello', overlay: {type: 'hello', atWord: 0, text: "Hi! Let's learn!"}},
				{kind: 'cutaway', startWord: at(0.15), why: 'Compare', scene: {type: 'cast', label: 'Meet the team', actors: [{character: 'kiko', mood: 'wow', atWord: at(0.15)}, {character: 'sparky', mood: 'cheer', arm: 'up', atWord: at(0.18)}], bubble: {text: 'Hello there!', atWord: at(0.2), actor: 1}}},
				{kind: 'camera', startWord: at(0.32), zoom: [1.04, 1.1], why: 'Count', overlay: {type: 'count', atWord: at(0.33), sign: '2 RULES'}},
				{kind: 'cutaway', startWord: at(0.48), why: 'Do / don’t', scene: {type: 'doDont', label: 'The right way', character: 'sparky', okWord: at(0.5), badWord: at(0.56)}},
				{kind: 'camera', startWord: at(0.62), zoom: [1, 1.06], why: 'Stickers', overlay: {type: 'stickers', items: [{atWord: at(0.63), label: 'key idea', color: 'mint'}]}},
				{kind: 'cutaway', startWord: at(0.74), why: 'Just right', scene: {type: 'justRight', label: 'Just right', character: 'ohmie', muchWord: at(0.76), littleWord: at(0.8), endWord: at(0.84)}},
				{kind: 'camera', startWord: at(0.88), zoom: [1, 1.04], why: 'Next time', overlay: {type: 'nextTime', atWord: at(0.89), title: 'Resistors', sub: 'how they do the job', guest: 'ohmie'}},
			],
			n,
		),
	};
}
