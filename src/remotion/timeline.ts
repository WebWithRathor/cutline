import type {KeepRange, Word, Zoom} from './types';

export type Segment = {srcStartMs: number; srcEndMs: number; outStartMs: number};

// Normalize keep ranges (clamp, sort, merge) and lay them end to end on the output timeline.
export function buildSegments(keep: KeepRange[] | undefined, sourceDurationMs: number): Segment[] {
	const ranges = (keep?.length ? keep : [{startMs: 0, endMs: sourceDurationMs}])
		.map((r) => ({startMs: Math.max(0, r.startMs), endMs: Math.min(sourceDurationMs, r.endMs)}))
		.filter((r) => r.endMs - r.startMs >= 120)
		.sort((a, b) => a.startMs - b.startMs);
	const merged: KeepRange[] = [];
	for (const r of ranges) {
		const last = merged[merged.length - 1];
		if (last && r.startMs <= last.endMs + 40) last.endMs = Math.max(last.endMs, r.endMs);
		else merged.push({...r});
	}
	if (!merged.length) merged.push({startMs: 0, endMs: sourceDurationMs});
	let out = 0;
	return merged.map((r) => {
		const seg = {srcStartMs: r.startMs, srcEndMs: r.endMs, outStartMs: out};
		out += r.endMs - r.startMs;
		return seg;
	});
}

export const outputDurationMs = (segs: Segment[]) =>
	segs.reduce((a, s) => a + (s.srcEndMs - s.srcStartMs), 0);

export function srcToOut(segs: Segment[], ms: number): number | null {
	for (const s of segs) if (ms >= s.srcStartMs && ms <= s.srcEndMs) return s.outStartMs + (ms - s.srcStartMs);
	return null;
}

// Words that survive the cuts, re-timed onto the output timeline.
export function mapWords(words: Word[], segs: Segment[]): Word[] {
	const out: Word[] = [];
	for (const w of words) {
		const mid = (w.startMs + w.endMs) / 2;
		const seg = segs.find((s) => mid >= s.srcStartMs && mid <= s.srcEndMs);
		if (!seg) continue;
		const clamp = (v: number) => Math.min(seg.srcEndMs, Math.max(seg.srcStartMs, v));
		out.push({
			text: w.text,
			startMs: seg.outStartMs + clamp(w.startMs) - seg.srcStartMs,
			endMs: seg.outStartMs + clamp(w.endMs) - seg.srcStartMs,
		});
	}
	return out;
}

export function mapZooms(zooms: Zoom[] | undefined, segs: Segment[]): Zoom[] {
	return (zooms ?? [])
		.map((z) => ({...z, atMs: srcToOut(segs, z.atMs) ?? -1}))
		.filter((z) => z.atMs >= 0);
}
