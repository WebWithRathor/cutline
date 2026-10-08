import {KIT_CHARS, KIT_ENGINE, KIT_PREAMBLE, KIT_PRIMS, KIT_PROPS} from './kit-source';

// Word format the kit's engine expects (seconds on the edited timeline).
export type KitWord = {w: string; s: number; e: number; line: number; brk?: boolean};

type Draw = (...args: never[]) => void;
type Sticker = [at: number, until: number, label: string, fill: string, y: number];

// The functions of the kit this app calls. Everything else stays internal to the kit.
export type Kit = {
	C: Record<string, string>;
	HAND: string;
	pop: (t: number, at: number, d?: number) => number;
	p: (t: number, a: number, b: number) => number;
	clamp: (x: number, a?: number, b?: number) => number;
	paper: (t: number, v: number) => void;
	tag: (t: number, s0: number, label: string) => void;
	txt: (s: string, x: number, y: number, o?: Record<string, unknown>) => void;
	bubble: (x: number, y: number, text: string, o?: Record<string, unknown>) => void;
	sparkle: (x: number, y: number, r: number, o?: Record<string, unknown>) => void;
	kiko: (x: number, y: number, sc: number, o?: Record<string, unknown>) => void;
	sparky: (x: number, y: number, sc: number, o?: Record<string, unknown>) => void;
	ohmie: (x: number, y: number, sc: number, o?: Record<string, unknown>) => void;
	zipCrowd: (x0: number, y0: number, x1: number, y1: number, n: number, o?: Record<string, unknown>) => void;
	batt: (x: number, y: number, sc: number, o?: Record<string, unknown>) => void;
	grandpaBulb: (x: number, y: number, sc: number, o?: Record<string, unknown>) => void;
	captions: (t: number) => void;
	wipe: (t: number, b: number, dir: number) => void;
	BEAT: {
		hello: (t: number, at: number, text?: string) => void;
		count: (t: number, at: number, sign: string) => void;
		stickers: (t: number, list: Sticker[]) => void;
		nextTime: (t: number, at: number, title: string, sub: string, guest?: (t: number, s: number) => void) => void;
		doDont: (t: number, s0: number, label: string, tOk: number, tBad: number, draw: (t: number, x: number, ok: boolean, s: number) => void) => void;
		justRight: (t: number, s0: number, label: string, tMuch: number, tLittle: number, tEnd: number, draw: (t: number, x: number, i: number, s: number) => void) => void;
	};
	_unused?: Draw;
};

// Evaluates the kit's own drawing code (trusted, shipped with the app) against a canvas context.
// Plans from the LLM are data only; they never become code.
export function createKit(ctx: CanvasRenderingContext2D, words: KitWord[], durSec: number, keywords: string[]): Kit {
	const body = `const W = 1920, H = 1080;
${KIT_PREAMBLE}
${KIT_PRIMS}
${KIT_PROPS}
${KIT_CHARS}
${KIT_ENGINE}
return {C, HAND, pop, p, clamp, paper, tag, txt, bubble, sparkle, kiko, sparky, ohmie, zipCrowd, batt, grandpaBulb, captions, wipe, BEAT};`;
	const win = {__words: words, __dur: durSec, __keywords: keywords.map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, ''))};
	return new Function('ctx', 'window', body)(ctx, win) as Kit;
}
