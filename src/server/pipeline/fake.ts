// Development only (CUTLINE_FAKE_AI=1): stands in for the transcription and planning APIs so the
// whole pipeline, including the real render, can be exercised without spending provider credits.
import type {CreativeBrief, EditPlan, Word} from '@/remotion/types';
import {sanitizeLook, type BrollMode} from './fx';
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

export function fakeCreative(): CreativeBrief {
	return {
		summary: 'A creator pitches a tool that captions short videos automatically.',
		theme: 'Creator tools',
		mood: 'Upbeat, confident',
		audience: 'Short-form creators',
		pacing: 'fast',
		palette: ['#0E0E10', '#FFFFFF', '#FFD43B', '#FF5A5F'],
		captionPresetId: 'pill-chip',
		captionWhy: 'High-contrast chips stay readable on any background.',
		grade: 'punchy',
		gradeWhy: 'Flat indoor light needs contrast and colour.',
		vfx: [{type: 'rgb-split', when: 'what if every'}, {type: 'film-burn', when: 'exactly what we'}],
		sfx: [{sound: 'boom', when: 'hours on captions'}, {sound: 'pop', when: 'popped on screen'}, {sound: 'cash', when: 'in minutes'}],
		broll: [
			{when: 'hours on captions', idea: 'Big number: 4 hours lost per video', source: 'remotion', why: 'Makes the pain concrete'},
			{when: 'Upload a clip', idea: 'Three steps ticking in: upload, pick, done', source: 'hyperframes', why: 'Shows how simple it is'},
		],
		notes: 'Open on the question, keep the energy high, end on the minutes claim.',
	};
}

export function fakePlan(words: Word[], brollMode: BrollMode = 'motion'): EditPlan & {captionPreset?: string} {
	const keywords = words.map((w, i) => (/^(hard|hours|every|popped|building|minutes)/i.test(w.text) ? i : -1)).filter((i) => i >= 0);
	const zooms = keywords.filter((_, k) => k % 2 === 0).map((at) => ({at, words: 3}));
	const find = (re: RegExp, fallback: number) => {
		const i = words.findIndex((w) => re.test(w.text));
		return i >= 0 ? i : Math.round(words.length * fallback);
	};
	const hours = find(/^hours/i, 0.25);
	const upload = Math.min(find(/^Upload/i, 0.6), words.length - 4);
	const look = sanitizeLook(
		{
			grade: 'punchy',
			vfx: [{type: 'focus-pull', at: 0}, {type: 'rgb-split', at: find(/^what$/i, 0.4)}, {type: 'film-burn', at: find(/^exactly/i, 0.8)}],
			sfx: [{sound: 'boom', at: hours}, {sound: 'pop', at: find(/^popped/i, 0.5)}, {sound: 'reverse-whoosh', at: upload}, {sound: 'cash', at: find(/^minutes/i, 0.9)}],
			broll: [
				{at: hours, until: hours + 4, source: 'remotion', layout: 'full', card: {type: 'number', title: '4 hours', sub: 'lost on captions, every video'}, why: 'Makes the pain concrete'},
				{
					at: upload,
					until: upload + 9,
					source: 'hyperframes',
					layout: 'full',
					card: {type: 'list', title: 'Three steps', items: ['Upload a clip', 'Pick a style', 'Get the short']},
					prompt: 'Three numbered steps slide in one after another on a dark background with yellow accents: "Upload a clip", "Pick a style", "Get the short".',
					why: 'Shows how simple it is',
				},
			],
		},
		words,
		new Set(),
		{brollMode},
	);
	return {...toPlan({remove: [], keywords, zooms, hook: 'Captions in one click'}, words, 500), ...look, captionPreset: 'pill-chip'};
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
		sfx: [
			{sound: 'pop' as const, atWord: 0, volume: 0.6},
			{sound: 'whoosh' as const, atWord: at(0.15), volume: 0.6},
			{sound: 'ding' as const, atWord: at(0.74), volume: 0.6},
		],
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
