// Shared types between the web app, the worker and the Remotion compositions.

export type Word = {
	text: string;
	startMs: number;
	endMs: number;
};

export type KeepRange = {startMs: number; endMs: number};

export type Zoom = {atMs: number; durationMs: number; scale: number};

// Produced by the LLM planning step, consumed by the render.
export type EditPlan = {
	keepRanges: KeepRange[]; // source-time ranges to keep (silences / fillers / retakes removed)
	keywords: string[]; // words to emphasize in captions
	zooms: Zoom[]; // punch-in moments, in source time
	hook?: string; // optional on-screen title for the first seconds
	notes?: string;
};

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
