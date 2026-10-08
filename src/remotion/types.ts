// Shared types between the web app, the worker and the Remotion compositions.

export type Word = {
	text: string;
	startMs: number;
	endMs: number;
};

export type KeepRange = {startMs: number; endMs: number};

export type Zoom = {atMs: number; durationMs: number; scale: number};

export type RemovedRange = {from: number; to: number; reason: string}; // source word indices, inclusive

// Produced by the LLM planning step, consumed by the render.
export type EditPlan = {
	keepRanges: KeepRange[]; // source-time ranges to keep (silences / fillers / retakes removed)
	keywords: string[]; // words to emphasize in captions
	zooms: Zoom[]; // punch-in moments, in source time
	hook?: string; // optional on-screen title for the first seconds
	notes?: string;
	removed?: RemovedRange[]; // what the planner cut and why (shown on the review screen)
	shots?: KidsShot[]; // Kit Student only: the beat plan
	grade?: GradeId; // colour grade for the footage
	vfx?: VfxCue[];
	sfx?: SfxCue[];
	broll?: BrollCue[];
};

// ---------- Look and feel (Gemini proposes, Claude places) ----------

export const GRADE_IDS = ['natural', 'warm-film', 'teal-orange', 'clean-bright', 'moody', 'vintage', 'mono', 'punchy', 'pastel'] as const;
export type GradeId = (typeof GRADE_IDS)[number];

export const VFX_TYPES = ['flash', 'shake', 'light-leak', 'glitch', 'whip', 'punch-zoom', 'zoom-blur', 'film-burn', 'rgb-split', 'slow-zoom', 'focus-pull', 'flicker', 'vhs', 'spin', 'swipe', 'letterbox'] as const;
export type VfxType = (typeof VFX_TYPES)[number];

export const SFX_IDS = ['whoosh', 'reverse-whoosh', 'swipe', 'pop', 'click', 'ding', 'notification', 'riser', 'impact', 'boom', 'bass-drop', 'glitch', 'shutter', 'typing', 'cash', 'heartbeat', 'record-scratch', 'tick', 'boing', 'sparkle'] as const;
export type SfxId = (typeof SFX_IDS)[number];

export const BROLL_SOURCES = ['remotion', 'hyperframes', 'higgsfield'] as const;
export type BrollSource = (typeof BROLL_SOURCES)[number];

export const CARD_TYPES = ['title', 'number', 'list', 'quote'] as const;
export type CardType = (typeof CARD_TYPES)[number];

// Word indices refer to the source transcript; the composition maps them onto the edited timeline.
export type VfxCue = {type: VfxType; atWord: number};
export type SfxCue = {sound: SfxId; atWord: number; volume?: number};

// A built-in Remotion card. Always present on a B-roll cue: it is what HyperFrames / Higgsfield fall back to.
export type BrollCard = {type: CardType; title: string; sub?: string; items?: string[]};

export type BrollCue = {
	id: string;
	atWord: number;
	untilWord: number; // last word the cutaway covers
	source: BrollSource;
	layout: 'full' | 'pip';
	card: BrollCard;
	prompt?: string; // higgsfield: text-to-video prompt; hyperframes: what the animation shows
	why?: string;
	assetKey?: string; // generated clip (HyperFrames / Higgsfield) in storage
	error?: string; // why generation fell back to the card
};

// Gemini's read of the raw video: the creative direction the edit should follow.
export type CreativeBrief = {
	summary: string;
	theme: string;
	mood: string;
	audience: string;
	pacing: 'calm' | 'steady' | 'fast';
	palette: string[]; // hex colours
	captionPresetId: string;
	captionWhy: string;
	grade: GradeId;
	gradeWhy: string;
	vfx: {type: VfxType; when: string}[];
	sfx: {sound: SfxId; when: string}[];
	broll: {when: string; idea: string; source: BrollSource; why: string}[];
	notes: string;
};

// ---------- Kit Student (kids-edit-kit) ----------

export const KIDS_CHARACTERS = ['kiko', 'sparky', 'ohmie', 'zips', 'batt', 'grandpaBulb'] as const;
export type KidsCharacter = (typeof KIDS_CHARACTERS)[number];
export const KIDS_COLORS = ['lemon', 'mint', 'pink', 'sky', 'lav', 'coral', 'gold'] as const;
export type KidsColor = (typeof KIDS_COLORS)[number];

export type KidsOverlay =
	| {type: 'hello'; atWord: number; text: string}
	| {type: 'count'; atWord: number; sign: string}
	| {type: 'stickers'; items: {atWord: number; untilWord?: number; label: string; color: KidsColor}[]}
	| {type: 'nextTime'; atWord: number; title: string; sub: string; guest?: KidsCharacter};

export type KidsActor = {character: KidsCharacter; mood?: string; arm?: string; atWord: number};

export type KidsScene =
	| {type: 'cast'; label?: string; actors: KidsActor[]; bubble?: {text: string; atWord: number; actor?: number}; title?: {text: string; atWord: number}}
	| {type: 'doDont'; label: string; character: KidsCharacter; okWord: number; badWord: number}
	| {type: 'justRight'; label: string; character: KidsCharacter; muchWord: number; littleWord: number; endWord: number};

// Word indices refer to the source transcript; the composition maps them onto the edited timeline.
export type KidsShot =
	| {kind: 'camera'; startWord: number; zoom: [number, number]; overlay?: KidsOverlay; why?: string}
	| {kind: 'cutaway'; startWord: number; scene: KidsScene; why?: string};

export type CaptionOverrides = {
	primaryColor?: string;
	accentColor?: string;
	fontFamily?: string;
	sizeScale?: number; // 0.6 – 1.6
	positionY?: number; // 0 (top) – 1 (bottom); undefined = preset default
	pageMs?: number; // how long a caption page may span; lower = fewer words on screen
};

export type CaptionStyleChoice = {
	presetId: string;
	overrides: CaptionOverrides;
};
