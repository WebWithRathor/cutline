import {PRESET_META} from '@/remotion/captions/meta';
import {BROLL_META, BROLL_MODE_META, CARD_META, GRADES, SFX_META, VFX_META, type BrollMode} from '@/remotion/fx/meta';
import {
	CARD_TYPES,
	GRADE_IDS,
	SFX_IDS,
	VFX_TYPES,
	type BrollCue,
	type BrollSource,
	type CardType,
	type CreativeBrief,
	type GradeId,
	type SfxCue,
	type SfxId,
	type VfxCue,
	type VfxType,
	type Word,
} from '@/remotion/types';

// Tool-schema pieces and validation for the look-and-feel part of Claude's plan (grade, VFX, SFX, B-roll).
// Plans are data: everything is clamped to known ids and valid word indices before it reaches a render.

export type {BrollMode};

// What Claude may pick in each mode. In Higgsfield mode every clip is AI footage; its card is only the fallback.
export const plannerSources = (mode: BrollMode): BrollSource[] => (mode === 'higgsfield' ? ['higgsfield'] : BROLL_MODE_META[mode].sources);

const idx = (d: string) => ({type: 'integer', description: d});

export const GRADE_SCHEMA = {type: 'string', enum: [...GRADE_IDS], description: 'Colour grade for the footage.'};
export const CAPTION_SCHEMA = {type: 'string', enum: PRESET_META.map((p) => p.id), description: 'Caption style for this video.'};
export const VFX_SCHEMA = {
	type: 'array',
	description: 'Visual effects on exact words. Use sparingly: real beats only, at least ~3 seconds apart.',
	items: {type: 'object', properties: {type: {type: 'string', enum: [...VFX_TYPES]}, at: idx('word index it hits on')}, required: ['type', 'at']},
};
export const SFX_SCHEMA = {
	type: 'array',
	description: 'Sound effects on exact words (a riser ends on its word). Pair them with effects, B-roll entrances and pops; never more than one per ~2 seconds.',
	items: {type: 'object', properties: {sound: {type: 'string', enum: [...SFX_IDS]}, at: idx('word index it hits on'), volume: {type: 'number', description: '0.2 - 1, default 0.6'}}, required: ['sound', 'at']},
};

export function brollSchema(sources: readonly BrollSource[]) {
	return {
		type: 'array',
		description: 'B-roll cutaways that cover the speaker while the voice keeps playing. 1.5-6 seconds each, never overlapping, never in the first 1.5 seconds.',
		items: {
			type: 'object',
			properties: {
				at: idx('first word it covers'),
				until: idx('last word it covers'),
				source: {type: 'string', enum: [...sources]},
				layout: {type: 'string', enum: ['full', 'pip'], description: 'full = covers the frame; pip = a card in the top half, speaker stays visible.'},
				card: {
					type: 'object',
					description: 'Always required: the built-in card (and the fallback if HyperFrames / Higgsfield fail). Short text, it is on screen for seconds.',
					properties: {
						type: {type: 'string', enum: [...CARD_TYPES]},
						title: {type: 'string', description: 'max 6 words'},
						sub: {type: 'string', description: 'optional, max 8 words'},
						items: {type: 'array', items: {type: 'string'}, description: 'list only: 2-4 items, max 4 words each'},
					},
					required: ['type', 'title'],
				},
				prompt: {
					type: 'string',
					description:
						'hyperframes: describe the motion graphic to animate (what appears, how it moves, text on it). higgsfield: a cinematic text-to-video prompt (subject, action, setting, camera, lighting, style), no text or logos in the shot.',
				},
				why: {type: 'string', description: 'a few words, shown to the creator'},
			},
			required: ['at', 'until', 'source', 'layout', 'card', 'why'],
		},
	};
}

export function lookGuide(opts: {sources: readonly BrollSource[]; captioned: boolean}) {
	const lines = [
		'Colour grades:',
		...GRADES.map((g) => `- ${g.id}: ${g.description}`),
		'Visual effects:',
		...(Object.keys(VFX_META) as VfxType[]).map((k) => `- ${k}: ${VFX_META[k].description}`),
		'Sound effects:',
		...(Object.keys(SFX_META) as SfxId[]).map((k) => `- ${k}: ${SFX_META[k].description}`),
	];
	if (opts.captioned) {
		lines.push('B-roll sources:', ...opts.sources.map((s) => `- ${s}: ${BROLL_META[s].description} (${BROLL_META[s].cost})`));
		lines.push('Card types:', ...CARD_TYPES.map((c) => `- ${c}: ${CARD_META[c]}`));
	}
	return lines.join('\n');
}

export function creativeText(c: CreativeBrief | null | undefined) {
	if (!c) return '';
	return `Creative brief from the director who watched the video (follow it; place each "when" on the matching words):\n${JSON.stringify(c, null, 1)}`;
}

const num = (v: unknown) => {
	const n = Math.round(Number(v));
	return Number.isFinite(n) ? n : -1;
};

// First word at or after i that survives the cuts, or -1.
function kept(i: number, n: number, removed: Set<number>) {
	if (i < 0 || i >= n) return -1;
	for (let j = i; j < n; j++) if (!removed.has(j)) return j;
	return -1;
}

const short = (v: unknown, words: number, chars: number) => String(v ?? '').trim().split(/\s+/).slice(0, words).join(' ').slice(0, chars);

export function sanitizeLook(
	raw: {grade?: unknown; vfx?: unknown; sfx?: unknown; broll?: unknown},
	words: Word[],
	removed: Set<number>,
	opts: {brollMode: BrollMode; fallbackGrade?: GradeId},
): {grade: GradeId; vfx: VfxCue[]; sfx: SfxCue[]; broll: BrollCue[]} {
	const n = words.length;
	const grade = GRADE_IDS.includes(raw.grade as GradeId) ? (raw.grade as GradeId) : (opts.fallbackGrade ?? 'natural');
	const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]).filter((x) => x && typeof x === 'object') : []);

	const vfx: VfxCue[] = [];
	for (const v of list(raw.vfx)) {
		const at = kept(num(v.at), n, removed);
		if (at < 0 || !VFX_TYPES.includes(v.type as VfxType)) continue;
		if (vfx.some((x) => Math.abs(words[x.atWord].startMs - words[at].startMs) < 1500)) continue;
		vfx.push({type: v.type as VfxType, atWord: at});
	}

	const sfx: SfxCue[] = [];
	for (const s of list(raw.sfx)) {
		const at = kept(num(s.at), n, removed);
		if (at < 0 || !SFX_IDS.includes(s.sound as SfxId)) continue;
		if (sfx.some((x) => Math.abs(words[x.atWord].startMs - words[at].startMs) < 600)) continue;
		const volume = Number(s.volume);
		sfx.push({sound: s.sound as SfxId, atWord: at, volume: Number.isFinite(volume) ? Math.min(1, Math.max(0.15, volume)) : 0.6});
	}

	const broll: BrollCue[] = [];
	if (opts.brollMode !== 'none') {
		const cand = list(raw.broll)
			.map((b) => ({b, at: kept(num(b.at), n, removed), until: Math.min(n - 1, num(b.until))}))
			.filter((x) => x.at >= 0 && words[x.at].startMs >= 1500)
			.sort((a, b) => a.at - b.at);
		for (const {b, at, until: u} of cand) {
			let until = Math.max(at, u);
			// 1.5 – 6 s on screen
			while (until > at && words[until].endMs - words[at].startMs > 6000) until--;
			while (until + 1 < n && words[until].endMs - words[at].startMs < 1500) until++;
			const prev = broll[broll.length - 1];
			if (prev && at <= prev.untilWord) continue;
			// a blink of the speaker between two cutaways looks like a mistake: run them back to back
			if (prev && words[at].startMs - words[prev.untilWord].endMs < 1200) prev.untilWord = at - 1;
			const c = (b.card ?? {}) as Record<string, unknown>;
			const type: CardType = CARD_TYPES.includes(c.type as CardType) ? (c.type as CardType) : 'title';
			const title = short(c.title, type === 'quote' ? 14 : 6, 90) || short(b.why, 6, 60) || 'Key idea';
			const items = Array.isArray(c.items) ? c.items.map((it) => short(it, 4, 32)).filter(Boolean).slice(0, 4) : undefined;
			const allowed = plannerSources(opts.brollMode);
			const source: BrollSource = allowed.includes(b.source as BrollSource) ? (b.source as BrollSource) : allowed[0];
			const prompt = String(b.prompt ?? '').trim().slice(0, 1200) || [c.title, c.sub].filter(Boolean).join(': ').slice(0, 300) || undefined;
			broll.push({
				id: `b${broll.length + 1}`,
				atWord: at,
				untilWord: until,
				source,
				layout: b.layout === 'pip' && source === 'remotion' ? 'pip' : 'full',
				card: {type, title, sub: short(c.sub, 8, 60) || undefined, items: type === 'list' ? (items?.length ? items : undefined) : undefined},
				prompt,
				why: short(b.why, 12, 120) || undefined,
			});
			if (broll.length >= 10) break;
		}
	}
	return {grade, vfx, sfx, broll};
}
