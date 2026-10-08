import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/caveat/600.css';
import '@fontsource/caveat/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig} from 'remotion';
import {SegmentedVideo} from '../compositions';
import {atWordMs, buildSegments, mapWords, outputDurationMs, wordOutTimes} from '../timeline';
import type {EditPlan, KidsShot, Word} from '../types';
import {createKit, type Kit, type KitWord} from './kit';
import {drawCamera, drawCutaway, type ResolvedOverlay, type ResolvedScene, type ResolvedShot} from './scenes';

export const KIDS_FPS = 25;
export const KIDS_W = 1920;
export const KIDS_H = 1080;

// Colour grade used for Kokoon Labs footage (CSS approximation of the kit's ffmpeg grade).
const GRADE = 'contrast(1.1) brightness(1.035) saturate(1.2)';

export type KidsExplainerProps = {
	src: string;
	sourceDurationMs: number;
	words: Word[];
	plan: EditPlan | null;
	preview?: boolean;
};

const KIT_FONTS = ['600 30px "Bricolage Grotesque"', '700 30px "Bricolage Grotesque"', '800 30px "Bricolage Grotesque"', '600 30px Caveat', '700 30px Caveat', '400 30px "JetBrains Mono"', '600 30px "JetBrains Mono"'];

function toKitWords(words: Word[]): KitWord[] {
	let line = 0;
	return words.map((w, i) => {
		const text = w.text.trim();
		const kw: KitWord = {w: text, s: w.startMs / 1000, e: w.endMs / 1000, line, brk: /[,;:]$/.test(text)};
		// a new caption line starts after sentence ends, or after a long pause
		const next = words[i + 1];
		if (/[.?!]["”']?$/.test(text) || (next && next.startMs - w.endMs > 700)) line++;
		return kw;
	});
}

// Turns word-indexed shots into timed shots on the edited timeline.
export function resolveShots(shots: KidsShot[] | undefined, outTimes: (number | null)[], durMs: number): ResolvedShot[] {
	const at = (i: number | undefined) => atWordMs(outTimes, i ?? 0) / 1000;
	const list = (shots?.length ? shots : [{kind: 'camera', startWord: 0, zoom: [1, 1.05]} as KidsShot])
		.map((sh) => ({sh, s: at(sh.startWord)}))
		.sort((a, b) => a.s - b.s);
	list[0].s = 0;
	// every shot lasts at least 1.2s: nudge a too-early start later, and drop it only if it no longer fits
	const MIN = 1.2;
	const kept: typeof list = [];
	for (const x of list) {
		const prev = kept[kept.length - 1];
		if (prev && x.s - prev.s < MIN) x.s = prev.s + MIN;
		if (x.s < durMs / 1000 - MIN) kept.push(x);
	}
	let cutawayN = 0;
	return kept.map(({sh, s}, i) => {
		const e = i + 1 < kept.length ? kept[i + 1].s : durMs / 1000;
		if (sh.kind === 'camera') {
			const o = sh.overlay;
			const overlay: ResolvedOverlay | undefined = !o
				? undefined
				: o.type === 'hello'
					? {type: 'hello', at: Math.max(s + 0.2, at(o.atWord)), text: o.text}
					: o.type === 'count'
						? {type: 'count', at: at(o.atWord), sign: o.sign}
						: o.type === 'nextTime'
							? {type: 'nextTime', at: at(o.atWord), title: o.title, sub: o.sub, guest: o.guest}
							: {type: 'stickers', items: o.items.map((it) => ({at: at(it.atWord), until: it.untilWord !== undefined ? at(it.untilWord) : e, label: it.label, color: it.color}))};
			return {kind: 'camera', s, e, zoom: sh.zoom, overlay};
		}
		const sc = sh.scene;
		const scene: ResolvedScene =
			sc.type === 'cast'
				? {
						type: 'cast',
						label: sc.label,
						actors: sc.actors.map((a) => ({character: a.character, mood: a.mood, arm: a.arm, at: at(a.atWord)})),
						bubble: sc.bubble ? {text: sc.bubble.text, at: at(sc.bubble.atWord), actor: sc.bubble.actor ?? 0} : undefined,
						title: sc.title ? {text: sc.title.text, at: at(sc.title.atWord)} : undefined,
					}
				: sc.type === 'doDont'
					? {type: 'doDont', label: sc.label, character: sc.character, tOk: at(sc.okWord), tBad: at(sc.badWord)}
					: {type: 'justRight', label: sc.label, character: sc.character, tMuch: at(sc.muchWord), tLittle: at(sc.littleWord), tEnd: at(sc.endWord)};
		return {kind: 'cutaway', s, e, scene, v: cutawayN++};
	});
}

export const kidsDurationMs = (p: Pick<KidsExplainerProps, 'plan' | 'sourceDurationMs'>) => outputDurationMs(buildSegments(p.plan?.keepRanges, p.sourceDurationMs));

export const KidsExplainer: React.FC<KidsExplainerProps> = ({src, sourceDurationMs, words, plan, preview}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const t = frame / fps;
	const canvas = useRef<HTMLCanvasElement>(null);
	const kit = useRef<{k: Kit; key: unknown} | null>(null);
	const [fontsHandle] = useState(() => delayRender('Loading kit fonts'));
	const [fontsReady, setFontsReady] = useState(false);

	useEffect(() => {
		Promise.all(KIT_FONTS.map((f) => document.fonts.load(f)))
			.catch(() => undefined)
			.then(() => {
				setFontsReady(true);
				continueRender(fontsHandle);
			});
	}, [fontsHandle]);

	const timeline = useMemo(() => {
		const segments = buildSegments(plan?.keepRanges, sourceDurationMs);
		const durMs = outputDurationMs(segments);
		const outWords = mapWords(words, segments);
		const outTimes = wordOutTimes(words, segments);
		return {segments, durMs, kitWords: toKitWords(outWords), shots: resolveShots(plan?.shots, outTimes, durMs)};
	}, [plan, sourceDurationMs, words]);

	const shot = timeline.shots.find((s) => t >= s.s && t < s.e) ?? timeline.shots[timeline.shots.length - 1];

	// camera zoom eases across the shot, anchored on the presenter's face (960, 330)
	const scaleAt = (ms: number) => {
		const sec = ms / 1000;
		const sh = timeline.shots.find((s) => sec >= s.s && sec < s.e);
		if (!sh || sh.kind !== 'camera') return 1;
		const u = Math.min(1, Math.max(0, (sec - sh.s) / Math.max(0.01, sh.e - sh.s)));
		return sh.zoom[0] + (sh.zoom[1] - sh.zoom[0]) * u;
	};

	useLayoutEffect(() => {
		const cv = canvas.current;
		if (!cv || !fontsReady) return;
		const ctx = cv.getContext('2d');
		if (!ctx) return;
		// rebuilt only when the timeline changes (live preview edits)
		if (kit.current?.key !== timeline) kit.current = {key: timeline, k: createKit(ctx, timeline.kitWords, timeline.durMs / 1000, plan?.keywords ?? [])};
		const k = kit.current.k;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalAlpha = 1;
		ctx.setLineDash([]);
		ctx.clearRect(0, 0, KIDS_W, KIDS_H);
		if (shot.kind === 'cutaway') drawCutaway(k, shot.scene, t, shot.s, shot.v);
		else drawCamera(k, shot.overlay, t);
		k.captions(t);
		timeline.shots.forEach((s, i) => {
			if (i) k.wipe(t, s.s, i % 2 ? 1 : -1);
		});
		const dur = timeline.durMs / 1000;
		if (t > dur - 0.45) {
			ctx.fillStyle = `rgba(0,0,0,${k.p(t, dur - 0.45, dur)})`;
			ctx.fillRect(0, 0, KIDS_W, KIDS_H);
		}
	});

	return (
		<AbsoluteFill style={{background: '#000'}}>
			<SegmentedVideo segments={timeline.segments} src={src} scaleAt={scaleAt} origin={`50% ${(330 / KIDS_H) * 100}%`} filter={GRADE} preview={preview} />
			<canvas ref={canvas} width={KIDS_W} height={KIDS_H} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />
		</AbsoluteFill>
	);
};
