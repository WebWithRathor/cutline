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

// The effect and sound library. Picked from what short-form editors use most (CapCut / Premiere / Shorts
// editing trends: zoom and whip transitions, glitch / RGB split, film burns, cinematic zooms and bars; the
// whoosh is the most downloaded editing sound, followed by hits, risers, pops and UI sounds).
// Gemini picks from this list for the video; Claude places each one on a word; everything is drawn or
// synthesized in code, so there is nothing to license.
export const VFX_META: Record<VfxType, {name: string; description: string; durationMs: number}> = {
	flash: {name: 'Flash', description: 'A white flash frame. Marks a reveal or a hard topic change.', durationMs: 260},
	shake: {name: 'Shake', description: 'Short camera shake. Impact moments, surprises, punchlines.', durationMs: 420},
	'punch-zoom': {name: 'Punch zoom', description: 'Hard, fast zoom-in on the speaker. Emphasis on a key line (the most used talking-head effect).', durationMs: 900},
	'zoom-blur': {name: 'Zoom blur', description: 'Fast zoom-through with motion blur. Energetic transition between ideas.', durationMs: 500},
	whip: {name: 'Whip pan', description: 'Fast horizontal motion blur. Switching ideas, "next".', durationMs: 340},
	swipe: {name: 'Swipe', description: 'Vertical swipe-through, like scrolling to the next idea. Lists, lifestyle content.', durationMs: 420},
	spin: {name: 'Spin', description: 'Quick 360° spin with blur. Playful, fashion, "plot twist".', durationMs: 500},
	glitch: {name: 'Glitch', description: 'Digital jitter with colour bars. Tech, "wait what", plot twists.', durationMs: 380},
	'rgb-split': {name: 'RGB split', description: 'Red / cyan channel split that snaps back. Bass hits, hype, tech.', durationMs: 600},
	vhs: {name: 'VHS', description: 'Scanlines, colour bleed and a tracking bar. Nostalgia, throwbacks, storytime.', durationMs: 1200},
	flicker: {name: 'Flicker', description: 'Brightness flicker. Tension, horror, "something is off".', durationMs: 450},
	'light-leak': {name: 'Light leak', description: 'Warm film light sweeping across. Soft transitions, emotional beats.', durationMs: 1300},
	'film-burn': {name: 'Film burn', description: 'Orange film-burn bloom that washes over and clears. Cinematic chapter changes, memories.', durationMs: 1100},
	'slow-zoom': {name: 'Slow zoom', description: 'Slow cinematic push-in over a few seconds. Serious or emotional lines.', durationMs: 2600},
	'focus-pull': {name: 'Focus pull', description: 'Footage comes into focus from a blur. Openings, reveals, "let me explain".', durationMs: 700},
	letterbox: {name: 'Cinematic bars', description: 'Black bars slide in for a few seconds. A dramatic or cinematic line.', durationMs: 2600},
};

export const SFX_META: Record<SfxId, {name: string; description: string}> = {
	whoosh: {name: 'Whoosh', description: 'Air swish. Transitions, B-roll in/out, whips (the most used editing sound).'},
	'reverse-whoosh': {name: 'Reverse whoosh', description: 'Swell that sucks in and stops on the word. Lead-in to a reveal or a cut.'},
	swipe: {name: 'Swipe', description: 'Short quick swipe. Small cuts, list items, swipe effects.'},
	pop: {name: 'Pop', description: 'Bubbly pop. Text, stickers or cards appearing, keyword pops.'},
	click: {name: 'Click', description: 'UI click. Lists, steps, tech actions.'},
	ding: {name: 'Ding', description: 'Bright bell. A correct answer, a tip, a win.'},
	notification: {name: 'Notification', description: 'Two-tone phone chime. Messages, alerts, "you got this".'},
	riser: {name: 'Riser', description: 'Rising tension sweep into a reveal (ends on the word).'},
	impact: {name: 'Impact', description: 'Punchy hit. Big statements, flashes, shakes.'},
	boom: {name: 'Deep boom', description: 'Heavy sub boom with a tail. The dramatic meme-style hit for a punchline or a shocking fact.'},
	'bass-drop': {name: 'Bass drop', description: 'Sub-bass dive. Hype moments, the payoff after a riser.'},
	glitch: {name: 'Glitch', description: 'Digital stutter. Pairs with glitch, RGB split and VHS.'},
	shutter: {name: 'Camera shutter', description: 'Photo snap. Freeze moments, screenshots, "picture this".'},
	typing: {name: 'Typing', description: 'Keyboard taps. Text appearing, searching, coding, writing.'},
	cash: {name: 'Cash register', description: '"Ka-ching". Money, prices, sales, profit.'},
	heartbeat: {name: 'Heartbeat', description: 'Two low thumps. Suspense, nerves, emotional moments.'},
	'record-scratch': {name: 'Record scratch', description: 'Scratch stop. "Wait, rewind", awkward turns, comedy.'},
	tick: {name: 'Clock tick', description: 'Tick-tock. Deadlines, time, waiting.'},
	boing: {name: 'Boing', description: 'Cartoon spring. Comedy, fails, bouncy moments.'},
	sparkle: {name: 'Sparkle', description: 'Shimmer of chimes. Magic, before/after, "glow up", new things.'},
};

// Sounds are generated in code (scripts/make-sfx.mjs), so there are no sample licences.
export const sfxFile = (id: SfxId) => `sfx/${id}.wav`;
export const SFX_LEAD_MS: Partial<Record<SfxId, number>> = {riser: 1400, 'reverse-whoosh': 620}; // starts this early so it peaks on the word

export const BROLL_META: Record<BrollSource, {name: string; description: string; cost: string}> = {
	remotion: {name: 'Remotion card', description: 'Built-in animated card: title, big number, list or quote, in the video’s palette.', cost: 'Free'},
	hyperframes: {name: 'HyperFrames', description: 'A custom motion-graphics animation Claude writes in HTML + GSAP, rendered on your machine.', cost: 'Claude tokens'},
	higgsfield: {name: 'Higgsfield', description: 'AI-generated footage from a text prompt (cinematic shots, places, objects, people doing things).', cost: 'Higgsfield credits'},
};

// How a video gets its B-roll, chosen per video on the new-video form.
export const BROLL_MODES = ['motion', 'higgsfield', 'none'] as const;
export type BrollMode = (typeof BROLL_MODES)[number];

export const BROLL_MODE_META: Record<BrollMode, {name: string; description: string; sources: BrollSource[]}> = {
	motion: {name: 'Remotion + HyperFrames', description: 'Motion graphics: animated cards, numbers, lists and custom HyperFrames animations. Free (HyperFrames uses some Claude tokens).', sources: ['remotion', 'hyperframes']},
	higgsfield: {name: 'Higgsfield', description: 'AI-generated footage of real-looking scenes. Uses your Higgsfield credits, only after you approve the storyboard.', sources: ['higgsfield', 'remotion']},
	none: {name: 'No B-roll', description: 'Keep the speaker on screen the whole time.', sources: []},
};

// Older projects stored 'auto' / 'remotion'.
export const brollModeOf = (v: unknown): BrollMode => (v === 'higgsfield' || v === 'none' ? v : 'motion');

export const CARD_META: Record<CardType, string> = {
	title: 'Big title with an optional subtitle. Chapters, topics, hooks.',
	number: 'One huge number or stat (title) with a label (sub). "3x", "$10k", "87%".',
	list: 'A heading (title) and 2-4 short items that tick in one by one.',
	quote: 'A short quote or key sentence (title) with an optional source (sub).',
};
