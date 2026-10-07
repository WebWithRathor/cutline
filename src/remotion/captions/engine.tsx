import React, {createContext, useContext, useMemo} from 'react';
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {createTikTokStyleCaptions} from '@remotion/captions';
import type {Caption, TikTokPage, TikTokToken} from '@remotion/captions';
import type {CaptionOverrides, Word} from '../types';

// Everything a caption preset needs, provided once by the composition.
type Ctx = {words: Word[]; keywords: Set<string>; o: CaptionOverrides};
const CaptionCtx = createContext<Ctx>({words: [], keywords: new Set(), o: {}});

export const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

export const CaptionProvider: React.FC<{
	words: Word[];
	keywords: string[];
	overrides: CaptionOverrides;
	children: React.ReactNode;
}> = ({words, keywords, overrides, children}) => {
	const value = useMemo(
		() => ({words, keywords: new Set(keywords.map(normalize)), o: overrides}),
		[words, keywords, overrides],
	);
	return <CaptionCtx.Provider value={value}>{children}</CaptionCtx.Provider>;
};

export const useCaptionCtx = () => useContext(CaptionCtx);

export const useTimeMs = () => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	return (frame / fps) * 1000;
};

const endsSentence = (t: string) => /[.?!]["”']?$/.test(t.trim());
export const bare = (s: string) => s.trim().replace(/[.,?!"“”:;]/g, '');
export const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Pages of words, never spanning a sentence boundary. pageMs = max span of one page.
export const usePage = (defaultPageMs: number): TikTokPage | null => {
	const {words, o} = useCaptionCtx();
	const t = useTimeMs();
	const pageMs = o.pageMs ?? defaultPageMs;
	const pages = useMemo(() => {
		const sentences: Caption[][] = [[]];
		words.forEach((w, i) => {
			sentences[sentences.length - 1].push({
				text: (i === 0 ? '' : ' ') + w.text.trim(),
				startMs: w.startMs,
				endMs: w.endMs,
				timestampMs: w.startMs,
				confidence: 1,
			});
			if (endsSentence(w.text)) sentences.push([]);
		});
		return sentences
			.filter((s) => s.length)
			.flatMap((s) => createTikTokStyleCaptions({captions: s, combineTokensWithinMilliseconds: pageMs}).pages);
	}, [words, pageMs]);
	for (let i = 0; i < pages.length; i++) {
		const p = pages[i];
		const next = pages[i + 1];
		const end = Math.min(next ? next.startMs : Infinity, p.startMs + p.durationMs + 600);
		if (t >= p.startMs && t < end) return p;
	}
	return null;
};

// The single word being spoken right now (for one-word-at-a-time presets).
export const useWord = () => {
	const {words} = useCaptionCtx();
	const t = useTimeMs();
	let idx = -1;
	for (let i = 0; i < words.length; i++) {
		const next = words[i + 1];
		const end = Math.min(next ? next.startMs : Infinity, words[i].endMs + 600);
		if (t >= words[i].startMs && t < end) {
			idx = i;
			break;
		}
	}
	return {idx, word: idx >= 0 ? words[idx] : null, words};
};

export const useSpringAt = () => {
	const {fps} = useVideoConfig();
	const t = useTimeMs();
	return (fromMs: number, config: Parameters<typeof spring>[0]['config'] = {damping: 14, stiffness: 180}) =>
		spring({frame: ((t - fromMs) / 1000) * fps, fps, config});
};

export const useIsKey = () => {
	const {keywords} = useCaptionCtx();
	return (text: string) => keywords.has(normalize(text));
};

export const isActive = (tok: TikTokToken, t: number) => tok.fromMs <= t && tok.toMs > t;
export const isSpoken = (tok: TikTokToken, t: number) => tok.fromMs <= t;

export const strokeText = (width: number, color = '#000'): React.CSSProperties => ({
	WebkitTextStroke: `${width}px ${color}`,
	paintOrder: 'stroke fill',
});

// Overrides helpers: colors, font, size.
export const useStyle = (defaults: {primary: string; accent: string; font: string}) => {
	const {o} = useCaptionCtx();
	const {width} = useVideoConfig();
	// presets are designed on a 1080-wide canvas; scale to the real video width
	const k = (width / 1080) * (o.sizeScale ?? 1);
	return {
		primary: o.primaryColor ?? defaults.primary,
		accent: o.accentColor ?? defaults.accent,
		font: o.fontFamily ? `"${o.fontFamily}"` : defaults.font,
		fs: (n: number) => Math.round(n * k),
		px: (n: number) => Math.round(n * (width / 1080)),
	};
};

// Where a preset sits. Default anchor comes from the preset (designed on 1080x1920); positionY override (0–1) wins.
export const Placement: React.FC<{
	anchor: {bottom?: number; top?: number; center?: boolean; left?: number};
	children: React.ReactNode;
}> = ({anchor, children}) => {
	const {o} = useCaptionCtx();
	const {width, height} = useVideoConfig();
	const k = width / 1080;
	const v = height / 1920;
	const leftAligned = anchor.left !== undefined;
	const pos: React.CSSProperties =
		o.positionY !== undefined
			? {top: o.positionY * height, transform: 'translateY(-50%)'}
			: anchor.center
				? {top: '50%', transform: 'translateY(-50%)'}
				: anchor.top !== undefined
					? {top: anchor.top * v}
					: {bottom: (anchor.bottom ?? 520) * v};
	return (
		<AbsoluteFill>
			<div
				style={{
					position: 'absolute',
					left: 0,
					right: 0,
					display: 'flex',
					justifyContent: leftAligned ? 'flex-start' : 'center',
					paddingLeft: leftAligned ? (anchor.left as number) * k : 60 * k,
					paddingRight: 60 * k,
					...pos,
				}}
			>
				{children}
			</div>
		</AbsoluteFill>
	);
};
