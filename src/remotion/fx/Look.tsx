import React from 'react';
import {AbsoluteFill, Html5Audio, OffthreadVideo, Sequence, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {atWordMs, wordOutTimes, type Segment} from '../timeline';
import type {BrollCue, EditPlan, GradeId, SfxId, VfxType, Word} from '../types';
import {SFX_LEAD_MS, VFX_META, getGrade, sfxFile} from './meta';

// The look layers of an edit: colour grade, visual effects, sound effects and B-roll cutaways.
// Cues are word-indexed in the plan and resolved onto the edited timeline here.

export type ResolvedBroll = {cue: BrollCue; startMs: number; endMs: number; src?: string};
export type ResolvedLook = {
	grade: GradeId | undefined;
	vfx: {type: VfxType; atMs: number}[];
	sfx: {sound: SfxId; atMs: number; volume: number}[];
	broll: ResolvedBroll[];
};

export function resolveLook(plan: EditPlan | null, words: Word[], segments: Segment[], brollSrc: Record<string, string> = {}): ResolvedLook {
	const out = wordOutTimes(words, segments);
	const at = (i: number) => atWordMs(out, i);
	const endOf = (i: number) => {
		const s = out[i];
		return s === null || s === undefined ? at(i) : s + Math.max(0, words[i].endMs - words[i].startMs);
	};
	return {
		grade: plan?.grade,
		vfx: (plan?.vfx ?? []).map((v) => ({type: v.type, atMs: at(v.atWord)})),
		sfx: (plan?.sfx ?? []).map((s) => ({sound: s.sound, atMs: Math.max(0, at(s.atWord) - (SFX_LEAD_MS[s.sound] ?? 0)), volume: s.volume ?? 0.6})),
		broll: (plan?.broll ?? [])
			.map((cue) => ({cue, startMs: at(cue.atWord), endMs: endOf(cue.untilWord) + 120, src: cue.source !== 'remotion' ? brollSrc[cue.id] : undefined}))
			.filter((b) => b.endMs - b.startMs >= 600),
	};
}

const toFrames = (ms: number, fps: number) => Math.round((ms / 1000) * fps);

// ---------- grade ----------

export const gradeFilter = (grade: GradeId | undefined) => (grade ? getGrade(grade).filter : undefined);

export const GradeOverlay: React.FC<{grade: GradeId | undefined}> = ({grade}) => {
	const frame = useCurrentFrame();
	if (!grade) return null;
	const g = getGrade(grade);
	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			{g.tint ? <AbsoluteFill style={{background: g.tint.color, mixBlendMode: g.tint.blend, opacity: g.tint.opacity}} /> : null}
			{g.vignette > 0 ? <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,${0.75 * g.vignette}) 100%)`}} /> : null}
			{g.grain > 0 ? (
				<svg width="100%" height="100%" style={{position: 'absolute', inset: 0, opacity: 0.16 * g.grain, mixBlendMode: 'overlay'}}>
					<filter id={`grain-${frame % 12}`}>
						<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 12} stitchTiles="stitch" />
						<feColorMatrix type="saturate" values="0" />
					</filter>
					<rect width="100%" height="100%" filter={`url(#grain-${frame % 12})`} />
				</svg>
			) : null}
		</AbsoluteFill>
	);
};

// ---------- VFX ----------

// Progress 0..1 through each active effect at time t (ms).
function active(vfx: ResolvedLook['vfx'], t: number) {
	return vfx
		.map((v) => ({...v, u: (t - v.atMs) / VFX_META[v.type].durationMs}))
		.filter((v) => v.u >= 0 && v.u <= 1);
}

// Transform for the footage layer: shake, punch zoom, whip and glitch jitter.
export function vfxTransform(vfx: ResolvedLook['vfx'], t: number, width: number): {transform?: string; filter?: string} {
	let x = 0;
	let y = 0;
	let scale = 1;
	let blur = 0;
	for (const v of active(vfx, t)) {
		if (v.type === 'shake') {
			const amp = width * 0.018 * (1 - v.u);
			x += (random(`sx${v.atMs}-${Math.round(t / 33)}`) - 0.5) * 2 * amp;
			y += (random(`sy${v.atMs}-${Math.round(t / 33)}`) - 0.5) * 2 * amp;
		} else if (v.type === 'punch-zoom') {
			scale *= interpolate(v.u, [0, 0.09, 0.7, 1], [1, 1.22, 1.2, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
		} else if (v.type === 'whip') {
			x += interpolate(v.u, [0, 0.5, 0.5001, 1], [0, -0.35, 0.35, 0]) * width;
			blur = Math.max(blur, Math.sin(Math.PI * v.u) * width * 0.03);
		} else if (v.type === 'glitch') {
			const step = Math.round(t / 40);
			x += (random(`gx${v.atMs}-${step}`) - 0.5) * width * 0.04;
		}
	}
	if (!x && !y && scale === 1 && !blur) return {};
	return {transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(4)})`, filter: blur ? `blur(${blur.toFixed(1)}px)` : undefined};
}

export const VfxOverlay: React.FC<{vfx: ResolvedLook['vfx']}> = ({vfx}) => {
	const frame = useCurrentFrame();
	const {fps, width, height} = useVideoConfig();
	const t = (frame / fps) * 1000;
	const on = active(vfx, t);
	if (!on.length) return null;
	return (
		<AbsoluteFill style={{pointerEvents: 'none'}}>
			{on.map((v) => {
				if (v.type === 'flash') return <AbsoluteFill key={v.atMs} style={{background: '#fff', opacity: interpolate(v.u, [0, 0.12, 1], [0.2, 0.95, 0])}} />;
				if (v.type === 'light-leak') {
					const pos = interpolate(v.u, [0, 1], [-40, 140]);
					const o = Math.sin(Math.PI * v.u) * 0.85;
					return (
						<AbsoluteFill
							key={v.atMs}
							style={{
								mixBlendMode: 'screen',
								opacity: o,
								background: `radial-gradient(ellipse 60% 90% at ${pos}% 40%, rgba(255,170,80,0.95), rgba(255,80,60,0.55) 40%, transparent 70%)`,
							}}
						/>
					);
				}
				if (v.type === 'glitch') {
					const step = Math.round(t / 40);
					return (
						<AbsoluteFill key={v.atMs} style={{mixBlendMode: 'screen'}}>
							{Array.from({length: 7}, (_, i) => {
								const r = (k: string) => random(`g${v.atMs}-${step}-${i}-${k}`);
								return (
									<div
										key={i}
										style={{
											position: 'absolute',
											left: (r('x') - 0.3) * width * 0.3,
											top: r('y') * height,
											width: width * (0.6 + r('w') * 0.6),
											height: height * (0.008 + r('h') * 0.05),
											background: r('c') > 0.5 ? 'rgba(0,255,255,0.55)' : 'rgba(255,0,170,0.55)',
										}}
									/>
								);
							})}
						</AbsoluteFill>
					);
				}
				return null;
			})}
		</AbsoluteFill>
	);
};

// ---------- SFX ----------

export const SfxTrack: React.FC<{sfx: ResolvedLook['sfx']}> = ({sfx}) => {
	const {fps} = useVideoConfig();
	return (
		<>
			{sfx.map((s, i) => (
				<Sequence key={`${s.sound}-${i}`} from={toFrames(s.atMs, fps)} durationInFrames={toFrames(1600, fps)} layout="none">
					<Html5Audio src={staticFile(sfxFile(s.sound))} volume={s.volume} />
				</Sequence>
			))}
		</>
	);
};

// ---------- B-roll ----------

export const DEFAULT_PALETTE = ['#111111', '#FFFFFF', '#FFD43B'];

const CardText: React.FC<{cue: BrollCue; palette: string[]; compact: boolean}> = ({cue, palette, compact}) => {
	const frame = useCurrentFrame();
	const {fps, width} = useVideoConfig();
	const [, fg, accent] = palette.length >= 3 ? palette : DEFAULT_PALETTE;
	const unit = width * (compact ? 0.75 : 1);
	const pop = (delay: number) => spring({frame: frame - delay, fps, config: {damping: 14, stiffness: 160}});
	const rise = (delay: number) => ({opacity: pop(delay), transform: `translateY(${(1 - pop(delay)) * unit * 0.04}px)`});
	const c = cue.card;
	const base: React.CSSProperties = {color: fg, fontFamily: 'Montserrat', textAlign: 'center', lineHeight: 1.05};
	if (c.type === 'number') {
		return (
			<div style={base}>
				<div style={{...rise(0), fontWeight: 900, fontSize: unit * 0.2, color: accent, transform: `scale(${0.6 + 0.4 * pop(0)})`}}>{c.title}</div>
				{c.sub ? <div style={{...rise(6), fontWeight: 800, fontSize: unit * 0.05, marginTop: unit * 0.03}}>{c.sub}</div> : null}
			</div>
		);
	}
	if (c.type === 'list') {
		return (
			<div style={{...base, textAlign: 'left'}}>
				<div style={{...rise(0), fontWeight: 900, fontSize: unit * 0.075, color: accent, marginBottom: unit * 0.04}}>{c.title}</div>
				{(c.items ?? []).map((it, i) => (
					<div key={i} style={{...rise(8 + i * 7), fontWeight: 800, fontSize: unit * 0.058, margin: `${unit * 0.018}px 0`, display: 'flex', alignItems: 'center', gap: unit * 0.025}}>
						<span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: unit * 0.075, height: unit * 0.075, borderRadius: unit, background: accent, color: palette[0] ?? '#111', fontSize: unit * 0.042}}>{i + 1}</span>
						{it}
					</div>
				))}
			</div>
		);
	}
	if (c.type === 'quote') {
		return (
			<div style={{...base, fontFamily: '"DM Serif Display"'}}>
				<div style={{...rise(0), fontSize: unit * 0.16, color: accent, lineHeight: 0.6}}>“</div>
				<div style={{...rise(3), fontSize: unit * 0.07, maxWidth: unit * 0.82}}>{c.title}</div>
				{c.sub ? <div style={{...rise(10), fontFamily: 'Inter', fontWeight: 700, fontSize: unit * 0.035, marginTop: unit * 0.04, opacity: 0.75}}>{c.sub}</div> : null}
			</div>
		);
	}
	return (
		<div style={base}>
			<div style={{...rise(0), fontWeight: 900, fontSize: unit * 0.1, maxWidth: unit * 0.86}}>{c.title}</div>
			<div style={{height: unit * 0.012, width: unit * 0.18 * pop(4), background: accent, margin: `${unit * 0.035}px auto`, borderRadius: unit}} />
			{c.sub ? <div style={{...rise(7), fontWeight: 800, fontSize: unit * 0.045, opacity: 0.85}}>{c.sub}</div> : null}
		</div>
	);
};

const BrollClip: React.FC<{b: ResolvedBroll; palette: string[]; durFrames: number}> = ({b, palette, durFrames}) => {
	const frame = useCurrentFrame();
	const {width, height} = useVideoConfig();
	const bg = palette[0] ?? DEFAULT_PALETTE[0];
	const enter = interpolate(frame, [0, 7], [0, 1], {extrapolateRight: 'clamp'});
	const exit = interpolate(frame, [durFrames - 6, durFrames], [1, 0], {extrapolateLeft: 'clamp'});
	const o = Math.min(enter, exit);
	if (b.cue.layout === 'pip' && !b.src) {
		return (
			<AbsoluteFill style={{alignItems: 'center', paddingTop: height * 0.09, opacity: o}}>
				<div
					style={{
						width: width * 0.84,
						padding: `${width * 0.07}px ${width * 0.05}px`,
						borderRadius: width * 0.04,
						background: `${bg}EE`,
						boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
						transform: `scale(${0.92 + 0.08 * enter})`,
						display: 'flex',
						justifyContent: 'center',
					}}
				>
					<CardText cue={b.cue} palette={palette} compact />
				</div>
			</AbsoluteFill>
		);
	}
	return (
		<AbsoluteFill style={{opacity: o, transform: `scale(${1.06 - 0.06 * enter})`}}>
			<AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 35%, ${palette[3] ?? bg} -40%, ${bg} 70%)`, alignItems: 'center', justifyContent: 'center', padding: width * 0.08}}>
				<CardText cue={b.cue} palette={palette} compact={false} />
			</AbsoluteFill>
			{/* generated footage covers the card; if the clip is shorter than the slot, the card shows underneath */}
			{b.src ? <OffthreadVideo src={b.src} muted style={{position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover'}} /> : null}
		</AbsoluteFill>
	);
};

export const BrollLayer: React.FC<{broll: ResolvedBroll[]; palette?: string[]}> = ({broll, palette}) => {
	const {fps} = useVideoConfig();
	const pal = palette?.length ? palette : DEFAULT_PALETTE;
	return (
		<>
			{broll.map((b) => {
				const from = toFrames(b.startMs, fps);
				const dur = Math.max(1, toFrames(b.endMs - b.startMs, fps));
				return (
					<Sequence key={b.cue.id} from={from} durationInFrames={dur} layout="none">
						<BrollClip b={b} palette={pal} durFrames={dur} />
					</Sequence>
				);
			})}
		</>
	);
};
