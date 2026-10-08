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
