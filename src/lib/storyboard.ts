// Turns an edit plan into storyboard panels: the edited video split at B-roll cutaways and sentence ends,
// each panel listing what is heard, what is seen and every effect that lands in it.
// Pure data, used by the review screen before anything is generated or rendered.
import {atWordMs, buildSegments, outputDurationMs, wordOutTimes} from '@/remotion/timeline';
import type {BrollCue, EditPlan, SfxCue, VfxCue, Word} from '@/remotion/types';

export type Panel = {
	n: number;
	startMs: number; // on the edited timeline
	endMs: number;
	fromWord: number; // source transcript indices
	toWord: number;
	said: string;
	keywords: string[];
	broll?: BrollCue;
	zoom: boolean;
	vfx: VfxCue[];
	sfx: SfxCue[];
	hook?: string;
};

const MAX_PANEL_MS = 7000;
const MIN_PANEL_MS = 1200;
const clean = (t: string) => t.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase();

export function buildStoryboard(plan: EditPlan, words: Word[], sourceDurationMs: number): Panel[] {
	const segs = buildSegments(plan.keepRanges, sourceDurationMs);
	const total = outputDurationMs(segs);
	const out = wordOutTimes(words, segs);
	const kept = words.map((_, i) => i).filter((i) => out[i] !== null);
	if (!kept.length) return [];

	// panel starts: B-roll in/out, then sentence ends, then a split when a panel runs long
	const starts = new Set<number>([kept[0]]);
	const nextKept = (i: number) => kept.find((k) => k > i);
	for (const b of plan.broll ?? []) {
		starts.add(b.atWord);
		const after = nextKept(b.untilWord);
		if (after !== undefined) starts.add(after);
	}
	let panelStart = atWordMs(out, kept[0]);
	for (let k = 0; k < kept.length; k++) {
		const i = kept[k];
		const t = out[i]!;
		if (starts.has(i)) panelStart = t;
		const next = kept[k + 1];
		if (next === undefined) break;
		const sentenceEnd = /[.?!]["”']?$/.test(words[i].text);
		if ((sentenceEnd && out[next]! - panelStart >= MIN_PANEL_MS * 2) || out[next]! - panelStart > MAX_PANEL_MS) {
			if (!(plan.broll ?? []).some((b) => next > b.atWord && next <= b.untilWord)) {
				starts.add(next);
				panelStart = out[next]!;
			}
		}
	}

	// a short on-camera panel joins the one before it (unless that is a B-roll panel)
	const isBroll = (i: number) => (plan.broll ?? []).some((b) => b.atWord === i);
	const startList: number[] = [];
	for (const i of kept.filter((k) => starts.has(k))) {
		const prev = startList[startList.length - 1];
		const next = kept.filter((k) => starts.has(k) && k > i)[0];
		const len = (next !== undefined ? atWordMs(out, next) : total) - atWordMs(out, i);
		if (prev !== undefined && len < MIN_PANEL_MS && !isBroll(i) && !isBroll(prev)) continue;
		startList.push(i);
	}
	const kw = new Set(plan.keywords);
	return startList.map((from, p) => {
		const nextStart = startList[p + 1];
		const to = nextStart !== undefined ? kept[kept.indexOf(nextStart) - 1] : kept[kept.length - 1];
		const startMs = p === 0 ? 0 : atWordMs(out, from);
		const endMs = nextStart !== undefined ? atWordMs(out, nextStart) : total;
		const inRange = (w: number) => w >= from && w <= to;
		const said = kept.filter(inRange).map((i) => words[i].text);
		return {
			n: p + 1,
			startMs,
			endMs,
			fromWord: from,
			toWord: to,
			said: said.join(' '),
			keywords: [...new Set(kept.filter(inRange).map((i) => clean(words[i].text)).filter((w) => kw.has(w)))],
			broll: (plan.broll ?? []).find((b) => b.atWord === from),
			zoom: (plan.zooms ?? []).some((z) => {
				const m = z.atMs;
				return m >= words[from].startMs && m <= words[to].endMs;
			}),
			vfx: (plan.vfx ?? []).filter((v) => inRange(v.atWord)),
			sfx: (plan.sfx ?? []).filter((s) => inRange(s.atWord)),
			hook: p === 0 ? plan.hook : undefined,
		};
	});
}

export const fmtTime = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
