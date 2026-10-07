import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import type {Word} from './types';

// Stand-in "footage" for style previews: soft room light and a person silhouette, so
// contrast and behind-the-person layering can be judged without a real video.
export const SceneBg: React.FC<{tone: 'cool' | 'warm'}> = ({tone}) => {
	const f = useCurrentFrame();
	const d = (s: number, a: number, p = 0) => Math.sin(f / s + p) * a;
	return (
		<AbsoluteFill
			style={{
				background:
					tone === 'warm'
						? 'linear-gradient(170deg, #e9dccb 0%, #cdb79c 45%, #8f7458 100%)'
						: 'linear-gradient(170deg, #9aa7bd 0%, #5c6a86 45%, #1d2433 100%)',
				overflow: 'hidden',
			}}
		>
			<div
				style={{
					position: 'absolute',
					left: `${11 + d(50, 3)}%`,
					top: `${6 + d(60, 1.5, 1)}%`,
					width: '48%',
					height: '36%',
					borderRadius: '50% 50% 4% 4%',
					background: tone === 'warm' ? 'rgba(255,248,235,0.7)' : 'rgba(220,232,255,0.45)',
					filter: 'blur(60px)',
				}}
			/>
		</AbsoluteFill>
	);
};

export const Subject: React.FC<{tone: 'cool' | 'warm'}> = ({tone}) => {
	const f = useCurrentFrame();
	const skin = tone === 'warm' ? '#3a2a22' : '#1b2130';
	const body = tone === 'warm' ? '#2b1f19' : '#141925';
	const pct = (n: number, of: number) => `${(n / of) * 100}%`;
	return (
		<AbsoluteFill style={{transform: `translateY(${Math.sin(f / 70) * 0.4}%)`, filter: 'blur(3px)'}}>
			<div style={{position: 'absolute', left: pct(140, 1080), top: pct(960, 1920), width: pct(800, 1080), height: pct(1100, 1920), borderRadius: '50% 50% 0 0 / 35% 35% 0 0', background: `linear-gradient(180deg, ${body}, #0a0c12)`}} />
			<div style={{position: 'absolute', left: pct(455, 1080), top: pct(820, 1920), width: pct(170, 1080), height: pct(200, 1920), borderRadius: 60, background: skin}} />
			<div
				style={{
					position: 'absolute',
					left: pct(365, 1080),
					top: pct(480, 1920),
					width: pct(350, 1080),
					height: pct(430, 1920),
					borderRadius: '50% 50% 46% 46%',
					background: `radial-gradient(ellipse at 45% 35%, ${tone === 'warm' ? '#5a4234' : '#2c3548'}, ${skin} 70%)`,
				}}
			/>
		</AbsoluteFill>
	);
};

// Sample voiceover used by every preview, with word timings shaped like transcription output.
const SAMPLE =
	"Most creators edit videos the hard way. They waste hours on captions. But what if every single word just popped on screen? That's exactly what we're building.";

export const SAMPLE_KEYWORDS = ['hard', 'hours', 'every', 'popped', 'building'];

export const SAMPLE_WORDS: Word[] = (() => {
	const words = SAMPLE.split(' ');
	const weights = words.map((w) => 2.2 + w.replace(/[^a-zA-Z]/g, '').length * 0.55);
	const pauses = words.map((w): number => (/[.?!]$/.test(w) ? 1.6 : 0));
	const total = weights.reduce((a, b) => a + b, 0) + pauses.reduce((a, b) => a + b, 0);
	const unit = (9700 - 300) / total;
	let t = 300;
	return words.map((text, i) => {
		const startMs = Math.round(t);
		const endMs = Math.round(t + weights[i] * unit);
		t += (weights[i] + pauses[i]) * unit;
		return {text, startMs, endMs};
	});
})();
