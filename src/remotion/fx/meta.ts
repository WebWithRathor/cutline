// Plain data about grades, effects, sounds and B-roll sources. Safe to import from server code:
// the AI prompts list these, and the compositions draw them.
import type {BrollSource, CardType, GradeId, SfxId, VfxType} from '../types';

export type GradeMeta = {
	id: GradeId;
	name: string;
	description: string;
	filter: string; // CSS filter on the footage
	tint?: {color: string; blend: 'soft-light' | 'overlay' | 'multiply' | 'screen' | 'color'; opacity: number};
	grain: number; // 0 – 1
	vignette: number; // 0 – 1
};

export const GRADES: GradeMeta[] = [
	{id: 'natural', name: 'Natural', description: 'Light contrast and colour lift, true skin tones. Safe for anything.', filter: 'contrast(1.05) saturate(1.06)', grain: 0, vignette: 0.15},
	{id: 'warm-film', name: 'Warm Film', description: 'Golden, soft highlights, film grain. Lifestyle, stories, cosy talks.', filter: 'contrast(1.06) saturate(1.1) sepia(0.12) brightness(1.02)', tint: {color: '#ff9a3c', blend: 'soft-light', opacity: 0.18}, grain: 0.35, vignette: 0.3},
	{id: 'teal-orange', name: 'Teal & Orange', description: 'Cinematic blockbuster split: warm skin, cool shadows. Ambitious, bold.', filter: 'contrast(1.12) saturate(1.18)', tint: {color: '#0f6f7a', blend: 'soft-light', opacity: 0.28}, grain: 0.15, vignette: 0.35},
	{id: 'clean-bright', name: 'Clean Bright', description: 'Airy, bright, crisp whites. Tech, education, product.', filter: 'brightness(1.07) contrast(1.04) saturate(1.04)', grain: 0, vignette: 0},
	{id: 'moody', name: 'Moody', description: 'Darker, desaturated, deep shadows. Serious, emotional, cinematic.', filter: 'brightness(0.92) contrast(1.18) saturate(0.82)', tint: {color: '#1d2a44', blend: 'soft-light', opacity: 0.3}, grain: 0.25, vignette: 0.5},
	{id: 'vintage', name: 'Vintage', description: 'Faded blacks, warm cast, heavy grain. Nostalgia, retro, storytelling.', filter: 'contrast(0.92) saturate(0.85) sepia(0.28) brightness(1.04)', tint: {color: '#d9b38c', blend: 'multiply', opacity: 0.12}, grain: 0.55, vignette: 0.45},
	{id: 'mono', name: 'Mono', description: 'Black and white with strong contrast. Dramatic, artistic, quotes.', filter: 'grayscale(1) contrast(1.22) brightness(1.02)', grain: 0.35, vignette: 0.4},
	{id: 'punchy', name: 'Punchy', description: 'High contrast, saturated, vivid. Energetic creators, hype, sports.', filter: 'contrast(1.18) saturate(1.35) brightness(1.02)', grain: 0, vignette: 0.2},
	{id: 'pastel', name: 'Pastel', description: 'Soft, low-contrast, gentle pinks. Beauty, wellness, calm lifestyle.', filter: 'contrast(0.9) saturate(0.9) brightness(1.08)', tint: {color: '#ffc4d6', blend: 'soft-light', opacity: 0.22}, grain: 0.1, vignette: 0},
];

export const getGrade = (id: string | undefined) => GRADES.find((g) => g.id === id) ?? GRADES[0];

export const VFX_META: Record<VfxType, {name: string; description: string; durationMs: number}> = {
	flash: {name: 'Flash', description: 'A white flash frame. Marks a reveal or a hard topic change.', durationMs: 260},
	shake: {name: 'Shake', description: 'Short camera shake. Impact moments, surprises, punchlines.', durationMs: 420},
	'light-leak': {name: 'Light leak', description: 'Warm film light sweeping across. Soft transitions, emotional beats.', durationMs: 1300},
	glitch: {name: 'Glitch', description: 'RGB split and jitter. Tech, "wait what", plot twists.', durationMs: 380},
	whip: {name: 'Whip', description: 'Fast horizontal motion blur. Switching ideas, "next".', durationMs: 340},
	'punch-zoom': {name: 'Punch zoom', description: 'Hard, fast zoom-in on the speaker. Emphasis on a key line.', durationMs: 900},
};

export const SFX_META: Record<SfxId, {name: string; description: string}> = {
	whoosh: {name: 'Whoosh', description: 'Air swish. Transitions, B-roll in/out, whips.'},
	pop: {name: 'Pop', description: 'Bubbly pop. Text or sticker appearing, keyword pops.'},
	click: {name: 'Click', description: 'UI click. Lists, steps, tech actions.'},
	ding: {name: 'Ding', description: 'Bright bell. A correct answer, a tip, a win.'},
	riser: {name: 'Riser', description: 'Rising tension sweep into a reveal (ends on the word).'},
	impact: {name: 'Impact', description: 'Deep boom. Big statements, flashes, shakes.'},
	glitch: {name: 'Glitch', description: 'Digital stutter. Pairs with the glitch VFX.'},
	swipe: {name: 'Swipe', description: 'Short quick swipe. Small cuts, list items.'},
};

// Sounds are generated in code (scripts/make-sfx.mjs), so there are no sample licences.
export const sfxFile = (id: SfxId) => `sfx/${id}.wav`;
export const SFX_LEAD_MS: Partial<Record<SfxId, number>> = {riser: 1400}; // starts this early so it peaks on the word

export const BROLL_META: Record<BrollSource, {name: string; description: string; cost: string}> = {
	remotion: {name: 'Remotion card', description: 'Built-in animated card: title, big number, list or quote, in the video’s palette.', cost: 'Free'},
	hyperframes: {name: 'HyperFrames', description: 'A custom motion-graphics animation Claude writes in HTML + GSAP, rendered on your machine.', cost: 'Claude tokens'},
	higgsfield: {name: 'Higgsfield', description: 'AI-generated footage from a text prompt (cinematic shots, places, objects, people doing things).', cost: 'Higgsfield credits'},
};

export const CARD_META: Record<CardType, string> = {
	title: 'Big title with an optional subtitle. Chapters, topics, hooks.',
	number: 'One huge number or stat (title) with a label (sub). "3x", "$10k", "87%".',
	list: 'A heading (title) and 2-4 short items that tick in one by one.',
	quote: 'A short quote or key sentence (title) with an optional source (sub).',
};
