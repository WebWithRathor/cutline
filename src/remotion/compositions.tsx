import './fonts';
import React, {useEffect, useMemo, useState} from 'react';
import {AbsoluteFill, OffthreadVideo, Sequence, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {CaptionProvider} from './captions/engine';
import {getPreset} from './captions/presets';
import {SAMPLE_KEYWORDS, SAMPLE_WORDS, SceneBg, Subject} from './DemoScene';
import {loadAllFonts} from './fonts';
import {buildSegments, mapWords, mapZooms, outputDurationMs} from './timeline';
import type {CaptionStyleChoice, EditPlan, Word} from './types';

// Holds rendering until caption fonts are loaded, so no frame falls back to a system font.
export const FontGate: React.FC<{children: React.ReactNode}> = ({children}) => {
	const [handle] = useState(() => delayRender('Loading caption fonts'));
	const [ready, setReady] = useState(false);
	useEffect(() => {
		loadAllFonts()
			.catch(() => undefined)
			.then(() => {
				setReady(true);
				continueRender(handle);
			});
	}, [handle]);
	return ready ? <>{children}</> : null;
};

// ---------- Style preview (gallery + picker) ----------

export type StylePreviewProps = {style: CaptionStyleChoice};

export const StylePreview: React.FC<StylePreviewProps> = ({style}) => {
	const preset = getPreset(style.presetId);
	const {Front, Behind} = preset;
	return (
		<FontGate>
			<CaptionProvider words={SAMPLE_WORDS} keywords={SAMPLE_KEYWORDS} overrides={style.overrides}>
				<AbsoluteFill>
					<SceneBg tone={preset.demoTone} />
					{Behind ? <Behind /> : null}
					<Subject tone={preset.demoTone} />
					<Front />
				</AbsoluteFill>
			</CaptionProvider>
		</FontGate>
	);
};

// ---------- The real edit ----------

export type CaptionedVideoProps = {
	src: string;
	sourceDurationMs: number;
	words: Word[];
	plan: EditPlan | null;
	style: CaptionStyleChoice;
	hookText?: string;
	preview?: boolean; // in-browser preview: show a notice instead of throwing if the browser can't decode the clip
};

const ZoomedVideo: React.FC<{segments: ReturnType<typeof buildSegments>; src: string; zooms: EditPlan['zooms']; preview?: boolean}> = ({segments, src, zooms, preview}) => {
	const frame = useCurrentFrame();
	const [unplayable, setUnplayable] = useState(false);
	const {fps} = useVideoConfig();
	const t = (frame / fps) * 1000;
	// gentle punch-in: ease up over 250ms, hold, ease back over 300ms
	let scale = 1;
	for (const z of zooms) {
		const k = interpolate(t, [z.atMs, z.atMs + 250, z.atMs + z.durationMs, z.atMs + z.durationMs + 300], [0, 1, 1, 0], {
			extrapolateLeft: 'clamp',
			extrapolateRight: 'clamp',
		});
		scale = Math.max(scale, 1 + (z.scale - 1) * k);
	}
	if (unplayable) {
		return (
			<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', background: '#1b2130', color: '#cfd8e3', fontFamily: 'Inter', fontSize: 34, padding: 80, textAlign: 'center', lineHeight: 1.4}}>
				This browser can’t play your clip’s video format, so the preview shows captions only. The rendered MP4 isn’t affected.
			</AbsoluteFill>
		);
	}
	return (
		<AbsoluteFill style={{transform: `scale(${scale})`, transformOrigin: '50% 38%'}}>
			{segments.map((s) => {
				const from = Math.round((s.outStartMs / 1000) * fps);
				const dur = Math.max(1, Math.round(((s.srcEndMs - s.srcStartMs) / 1000) * fps));
				return (
					<Sequence key={s.srcStartMs} from={from} durationInFrames={dur} layout="none">
						<OffthreadVideo
							src={src}
							trimBefore={Math.round((s.srcStartMs / 1000) * fps)}
							style={{width: '100%', height: '100%', objectFit: 'cover'}}
							onError={preview ? () => setUnplayable(true) : undefined}
						/>
					</Sequence>
				);
			})}
		</AbsoluteFill>
	);
};

const Hook: React.FC<{text: string}> = ({text}) => {
	const frame = useCurrentFrame();
	const {fps, width} = useVideoConfig();
	const o = interpolate(frame, [0, 6, fps * 2.2, fps * 2.6], [0, 1, 1, 0], {extrapolateRight: 'clamp'});
	return (
		<AbsoluteFill style={{alignItems: 'center', paddingTop: width * 0.2}}>
			<div
				style={{
					opacity: o,
					maxWidth: width * 0.86,
					textAlign: 'center',
					fontFamily: 'Montserrat',
					fontWeight: 900,
					fontSize: width * 0.075,
					lineHeight: 1.05,
					color: '#fff',
					background: 'rgba(0,0,0,0.55)',
					padding: `${width * 0.02}px ${width * 0.035}px`,
					borderRadius: width * 0.025,
				}}
			>
				{text}
			</div>
		</AbsoluteFill>
	);
};

export const CaptionedVideo: React.FC<CaptionedVideoProps> = ({src, sourceDurationMs, words, plan, style, hookText, preview}) => {
	const segments = useMemo(() => buildSegments(plan?.keepRanges, sourceDurationMs), [plan, sourceDurationMs]);
	const outWords = useMemo(() => mapWords(words, segments), [words, segments]);
	const zooms = useMemo(() => mapZooms(plan?.zooms, segments), [plan, segments]);
	const preset = getPreset(style.presetId);
	const {Front, Behind} = preset;
	return (
		<FontGate>
			<CaptionProvider words={outWords} keywords={plan?.keywords ?? []} overrides={style.overrides}>
				<AbsoluteFill style={{background: '#000'}}>
					<ZoomedVideo segments={segments} src={src} zooms={zooms} preview={preview} />
					{/* Without a person matte, the "behind" layer is drawn over the video. */}
					{Behind ? <Behind /> : null}
					<Front />
					{hookText ? <Hook text={hookText} /> : null}
				</AbsoluteFill>
			</CaptionProvider>
		</FontGate>
	);
};

export const captionedVideoDurationMs = (p: Pick<CaptionedVideoProps, 'plan' | 'sourceDurationMs'>) =>
	outputDurationMs(buildSegments(p.plan?.keepRanges, p.sourceDurationMs));
