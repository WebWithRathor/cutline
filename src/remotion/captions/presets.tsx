import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {
	Placement,
	bare,
	cap1,
	isActive,
	isSpoken,
	strokeText,
	useCaptionCtx,
	useIsKey,
	usePage,
	useSpringAt,
	useStyle,
	useTimeMs,
	useWord,
} from './engine';
import {PRESET_META, getPresetMeta, type PresetMeta} from './meta';

const meta = (id: string) => getPresetMeta(id).defaults;


// ===================== Trend library =====================

const D_MIN = meta('dynamic-minimal');
const DynamicMinimal: React.FC = () => {
	const page = usePage(900);
	const t = useTimeMs();
	const sp = useSpringAt();
	const s = useStyle(D_MIN);
	if (!page) return null;
	return (
		<Placement anchor={{bottom: 520}}>
			<div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: `0 ${s.px(22)}px`, maxWidth: s.px(940)}}>
				{page.tokens.map((tok) => {
					const k = sp(tok.fromMs, {damping: 20, stiffness: 220});
					return (
						<span
							key={tok.fromMs}
							style={{
								fontFamily: s.font,
								fontWeight: 900,
								fontSize: s.fs(104),
								lineHeight: 1.12,
								color: s.primary,
								...strokeText(s.fs(14)),
								textShadow: '0 6px 18px rgba(0,0,0,0.35)',
								opacity: isSpoken(tok, t) ? k : 0,
								transform: `scale(${interpolate(k, [0, 1], [0.86, 1])})`,
								display: 'inline-block',
							}}
						>
							{tok.text.trim()}
						</span>
					);
				})}
			</div>
		</Placement>
	);
};

const D_PILL = meta('pill-chip');
const PillChip: React.FC = () => {
	const page = usePage(1200);
	const t = useTimeMs();
	const sp = useSpringAt();
	const s = useStyle(D_PILL);
	if (!page) return null;
	const enter = sp(page.startMs, {damping: 16, stiffness: 200});
	return (
		<Placement anchor={{bottom: 520}}>
			<div
				style={{
					display: 'flex',
					flexWrap: 'wrap',
					justifyContent: 'center',
					gap: s.px(10),
					padding: `${s.px(18)}px ${s.px(22)}px`,
					borderRadius: s.px(36),
					background: 'rgba(12,12,14,0.86)',
					maxWidth: s.px(940),
					transform: `translateY(${interpolate(enter, [0, 1], [30, 0])}px) scale(${interpolate(enter, [0, 1], [0.92, 1])})`,
					opacity: enter,
				}}
			>
				{page.tokens.map((tok) => {
					const active = isActive(tok, t);
					const k = sp(tok.fromMs, {damping: 12, stiffness: 260});
					return (
						<span
							key={tok.fromMs}
							style={{
								fontFamily: s.font,
								fontWeight: 800,
								fontSize: s.fs(76),
								lineHeight: 1.1,
								padding: `${s.px(8)}px ${s.px(22)}px ${s.px(12)}px`,
								borderRadius: s.px(26),
								color: active ? '#111' : s.primary,
								background: active ? s.accent : 'transparent',
								transform: active ? `scale(${interpolate(k, [0, 1], [0.9, 1.04])})` : 'none',
								opacity: isSpoken(tok, t) ? 1 : 0.35,
								display: 'inline-block',
							}}
						>
							{tok.text.trim()}
						</span>
					);
				})}
			</div>
		</Placement>
	);
};

const D_CLASSIC = meta('classic-highlight');
const ClassicHighlight: React.FC = () => {
	const page = usePage(700);
	const t = useTimeMs();
	const sp = useSpringAt();
	const isKey = useIsKey();
	const s = useStyle(D_CLASSIC);
	if (!page) return null;
	return (
		<Placement anchor={{bottom: 640}}>
			<div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: `0 ${s.px(26)}px`, maxWidth: s.px(960)}}>
				{page.tokens.map((tok) => {
					const active = isActive(tok, t);
					const spoken = isSpoken(tok, t);
					const k = sp(tok.fromMs, {damping: 9, stiffness: 240});
					return (
						<span
							key={tok.fromMs}
							style={{
								fontFamily: s.font,
								fontSize: s.fs(150),
								lineHeight: 1.05,
								textTransform: 'uppercase',
								color: active || isKey(tok.text) ? s.accent : s.primary,
								...strokeText(s.fs(18)),
								textShadow: `0 ${s.fs(10)}px 0 rgba(0,0,0,0.85)`,
								opacity: spoken ? 1 : 0,
								transform: `scale(${spoken ? interpolate(k, [0, 1], [0.6, active ? 1.12 : 1]) : 0.6}) rotate(${active ? -2 : 0}deg)`,
								display: 'inline-block',
							}}
						>
							{tok.text.trim()}
						</span>
					);
				})}
			</div>
		</Placement>
	);
};

const D_TYPE = meta('typewriter');
const Typewriter: React.FC = () => {
	const page = usePage(1800);
	const t = useTimeMs();
	const frame = useCurrentFrame();
	const s = useStyle(D_TYPE);
	if (!page) return null;
	let text = '';
	for (const tok of page.tokens) {
		if (t < tok.fromMs) break;
		const p = Math.min(1, (t - tok.fromMs) / Math.max(1, tok.toMs - tok.fromMs));
		text += tok.text.slice(0, Math.max(1, Math.round(tok.text.length * p)));
	}
	return (
		<Placement anchor={{bottom: 480}}>
			<div
				style={{
					fontFamily: s.font,
					fontSize: s.fs(84),
					lineHeight: 1.2,
					color: s.primary,
					width: s.px(900),
					minHeight: s.fs(210),
					padding: `${s.px(26)}px ${s.px(36)}px`,
					borderRadius: s.px(18),
					background: 'rgba(0,0,0,0.5)',
					whiteSpace: 'pre-wrap',
				}}
			>
				{text.trimStart()}
				<span
					style={{
						display: 'inline-block',
						width: s.px(6),
						height: s.fs(78),
						marginLeft: s.px(8),
						verticalAlign: '-10%',
						background: s.accent,
						opacity: Math.floor(frame / 12) % 2 === 0 ? 1 : 0,
					}}
				/>
			</div>
		</Placement>
	);
};

const D_SWITCH = meta('color-switch');
const ColorSwitch: React.FC = () => {
	const {idx, word} = useWord();
	const sp = useSpringAt();
	const s = useStyle(D_SWITCH);
	if (!word) return null;
	const k = sp(word.startMs, {damping: 8, stiffness: 300});
	return (
		<Placement anchor={{bottom: 700}}>
			<div
				style={{
					fontFamily: s.font,
					fontSize: s.fs(170),
					textTransform: 'uppercase',
					color: idx % 2 ? s.accent : s.primary,
					...strokeText(s.fs(16)),
					textShadow: '0 12px 30px rgba(0,0,0,0.45)',
					transform: `scale(${interpolate(k, [0, 1], [0.4, 1])}) rotate(${interpolate(k, [0, 1], [idx % 2 ? 8 : -8, 0])}deg)`,
				}}
			>
				{bare(word.text)}
			</div>
		</Placement>
	);
};

const D_QUIET = meta('quiet-lowercase');
const QuietLowercase: React.FC = () => {
	const page = usePage(1500);
	const t = useTimeMs();
	const s = useStyle(D_QUIET);
	if (!page) return null;
	return (
		<Placement anchor={{bottom: 600}}>
			<div
				style={{
					fontFamily: s.font,
					fontWeight: 300,
					fontSize: s.fs(66),
					color: s.primary,
					textTransform: 'lowercase',
					textAlign: 'center',
					textShadow: '0 2px 18px rgba(0,0,0,0.55)',
					opacity: interpolate(t, [page.startMs, page.startMs + 250], [0, 1], {extrapolateRight: 'clamp'}),
					maxWidth: s.px(940),
				}}
			>
				{page.text.trim().replace(/[.?!]$/, '')}
			</div>
		</Placement>
	);
};

const D_SHORTS = meta('shorts-clean');
const ShortsClean: React.FC = () => {
	const page = usePage(1400);
	const sp = useSpringAt();
	const s = useStyle(D_SHORTS);
	if (!page) return null;
	const k = sp(page.startMs, {damping: 200});
	return (
		<Placement anchor={{bottom: 560}}>
			<div
				style={{
					fontFamily: s.font,
					fontWeight: 800,
					fontSize: s.fs(82),
					lineHeight: 1.15,
					color: s.primary,
					textAlign: 'center',
					...strokeText(s.fs(8)),
					textShadow: '0 4px 14px rgba(0,0,0,0.5)',
					maxWidth: s.px(920),
					opacity: k,
					transform: `translateY(${interpolate(k, [0, 1], [16, 0])}px)`,
				}}
			>
				{page.text.trim()}
			</div>
		</Placement>
	);
};

// ===================== From the user's references =====================

const D_DUO = meta('script-heavy-duo');
const ScriptHeavyDuo: React.FC = () => {
	const page = usePage(1300);
	const t = useTimeMs();
	const sp = useSpringAt();
	const isKey = useIsKey();
	const s = useStyle(D_DUO);
	if (!page) return null;
	const toks = page.tokens;
	let keyIdx = toks.findIndex((x) => isKey(x.text));
	if (keyIdx < 0) toks.forEach((x, i) => (keyIdx < 0 || bare(x.text).length > bare(toks[keyIdx].text).length ? (keyIdx = i) : 0));
	const big = toks[keyIdx];
	const bigWord = bare(big.text);
	const bigK = sp(big.fromMs, {damping: 11, stiffness: 200});
	const script = (list: typeof toks, rot: number, mt: number, mb: number) =>
		list.length ? (
			<div style={{display: 'flex', gap: s.px(48), zIndex: 2, marginTop: s.px(mt), marginBottom: s.px(mb), transform: `rotate(${rot}deg)`}}>
				{list.map((tok) => {
					const k = sp(tok.fromMs, {damping: 18, stiffness: 160});
					return (
						<span
							key={tok.fromMs}
							style={{
								fontFamily: 'Allura',
								fontSize: s.fs(132),
								color: s.primary,
								textShadow: '0 4px 16px rgba(0,0,0,0.45)',
								opacity: isSpoken(tok, t) ? k : 0,
								transform: `translateY(${interpolate(k, [0, 1], [18, 0])}px)`,
								display: 'inline-block',
							}}
						>
							{bare(tok.text).toLowerCase()}
						</span>
					);
				})}
			</div>
		) : null;
	return (
		<Placement anchor={{bottom: 430}}>
			<div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
				{script(toks.slice(0, keyIdx), -4, 0, -58)}
				<div
					style={{
						fontFamily: s.font,
						fontWeight: 900,
						fontSize: Math.min(s.fs(200), s.fs(1450 / Math.max(1, bigWord.length))),
						letterSpacing: s.px(-4),
						lineHeight: 1,
						color: s.accent,
						textShadow: '0 10px 30px rgba(0,0,0,0.35)',
						opacity: isSpoken(big, t) ? 1 : 0,
						transform: `scale(${interpolate(bigK, [0, 1], [0.7, 1])})`,
					}}
				>
					{cap1(bigWord)}
				</div>
				{script(toks.slice(keyIdx + 1), -3, -40, 0)}
			</div>
		</Placement>
	);
};

const D_RISE = meta('smooth-rise');
const SmoothRise: React.FC = () => {
	const page = usePage(1500);
	const t = useTimeMs();
	const sp = useSpringAt();
	const s = useStyle(D_RISE);
	if (!page) return null;
	return (
		<Placement anchor={{bottom: 560}}>
			<div style={{display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: `${s.px(4)}px ${s.px(20)}px`, maxWidth: s.px(900)}}>
				{page.tokens.map((tok) => {
					const k = sp(tok.fromMs, {damping: 13, stiffness: 120, mass: 0.9});
					const spoken = isSpoken(tok, t);
					return (
						<span key={tok.fromMs} style={{overflow: 'hidden', display: 'inline-block', paddingBottom: s.px(10)}}>
							<span
								style={{
									display: 'inline-block',
									fontFamily: s.font,
									fontWeight: 700,
									fontSize: s.fs(80),
									lineHeight: 1.15,
									color: s.primary,
									textShadow: '0 4px 20px rgba(0,0,0,0.45)',
									transform: `translateY(${spoken ? interpolate(k, [0, 1], [105, 0]) : 105}%)`,
									filter: `blur(${spoken ? interpolate(k, [0, 1], [10, 0], {extrapolateRight: 'clamp'}) : 10}px)`,
									opacity: spoken ? interpolate(k, [0, 0.6], [0, 1], {extrapolateRight: 'clamp'}) : 0,
								}}
							>
								{tok.text.trim()}
							</span>
						</span>
					);
				})}
			</div>
		</Placement>
	);
};

const D_CHIP = meta('safe-zone-chip');
const SafeZoneChip: React.FC = () => {
	const {idx, word, words} = useWord();
	const sp = useSpringAt();
	const isKey = useIsKey();
	const s = useStyle(D_CHIP);
	if (!word) return null;
	const key = isKey(word.text);
	const prev = idx > 0 && !/[.?!]$/.test(words[idx - 1].text.trim()) ? words[idx - 1] : null;
	const chipWord = key ? prev : word;
	const k = sp(word.startMs, {damping: 14, stiffness: 320});
	return (
		<Placement anchor={{top: 1010}}>
			<div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
				{chipWord && (
					<div
						style={{
							fontFamily: s.font,
							fontWeight: 900,
							fontSize: s.fs(46),
							letterSpacing: 1,
							textTransform: 'uppercase',
							color: s.primary,
							background: s.accent,
							padding: `${s.px(6)}px ${s.px(14)}px ${s.px(7)}px`,
							borderRadius: s.px(8),
							transform: key ? 'none' : `scale(${interpolate(k, [0, 1], [0.75, 1])})`,
							boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
						}}
					>
						{bare(chipWord.text)}
					</div>
				)}
				{key && (
					<div
						style={{
							marginTop: s.px(6),
							fontFamily: s.font,
							fontWeight: 900,
							fontSize: s.fs(150),
							letterSpacing: s.px(-5),
							color: s.accent,
							textShadow: '0 8px 30px rgba(0,0,0,0.4)',
							transform: `scale(${interpolate(k, [0, 1], [0.6, 1])})`,
						}}
					>
						“{cap1(bare(word.text))}”
					</div>
				)}
			</div>
		</Placement>
	);
};

const D_NEG = meta('negative-space-glow');
const NegativeSpaceGlow: React.FC = () => {
	const {word} = useWord();
	const s = useStyle(D_NEG);
	if (!word) return null;
	return (
		<Placement anchor={{top: 270}}>
			<div
				style={{
					fontFamily: s.font,
					fontSize: s.fs(150),
					color: s.primary,
					textTransform: 'lowercase',
					textShadow: '0 0 18px rgba(255,255,255,0.75), 0 0 40px rgba(255,255,255,0.35), 0 4px 10px rgba(0,0,0,0.25)',
				}}
			>
				{bare(word.text).toLowerCase()}
			</div>
		</Placement>
	);
};

const D_STACK = meta('glow-stack');
const GlowStack: React.FC = () => {
	const page = usePage(1600);
	const t = useTimeMs();
	const sp = useSpringAt();
	const isKey = useIsKey();
	const {words} = useCaptionCtx();
	const s = useStyle(D_STACK);
	if (!page) return null;
	const lines: {key: boolean; toks: typeof page.tokens}[] = [];
	page.tokens.forEach((tok) => {
		const k = isKey(tok.text);
		const last = lines[lines.length - 1];
		if (k || !last || last.key || last.toks.length >= 2) lines.push({key: k, toks: [tok]});
		else last.toks.push(tok);
	});
	const keyStarts = words.filter((w) => isKey(w.text)).map((w) => w.startMs);
	return (
		<Placement anchor={{bottom: 520}}>
			<div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
				{lines.map((line, li) => (
					<div key={li} style={{display: 'flex', gap: s.px(22), marginTop: li === 0 ? 0 : s.px(-14)}}>
						{line.toks.map((tok) => {
							const k = sp(tok.fromMs, {damping: 12, stiffness: 220});
							const spoken = isSpoken(tok, t);
							const italic = keyStarts.indexOf(tok.fromMs) % 2 === 1;
							return (
								<span
									key={tok.fromMs}
									style={{
										display: 'inline-block',
										opacity: spoken ? 1 : 0,
										transform: `scale(${spoken ? interpolate(k, [0, 1], [0.7, 1]) : 0.7})`,
										...(line.key
											? {
													fontFamily: 'Fraunces',
													fontWeight: 900,
													fontStyle: italic ? 'italic' : 'normal',
													fontSize: s.fs(168),
													lineHeight: 1,
													letterSpacing: s.px(-3),
													color: s.accent,
													textShadow: `0 0 26px ${s.accent}a6, 0 0 60px ${s.accent}4d`,
												}
											: {
													fontFamily: s.font,
													fontWeight: 800,
													fontSize: s.fs(104),
													lineHeight: 1.02,
													letterSpacing: s.px(-2),
													color: s.primary,
													textTransform: 'lowercase',
													textShadow: '0 0 22px rgba(255,255,255,0.45), 0 4px 14px rgba(0,0,0,0.35)',
												}),
									}}
								>
									{line.key ? cap1(bare(tok.text)) : bare(tok.text)}
								</span>
							);
						})}
					</div>
				))}
			</div>
		</Placement>
	);
};

const D_EDIT = meta('editorial-behind');
const useEditorialKey = () => {
	const {words} = useCaptionCtx();
	const isKey = useIsKey();
	const t = useTimeMs();
	let start = 0;
	let key: (typeof words)[number] | null = null;
	for (let i = 0; i < words.length && words[i].startMs <= t; i++) {
		if (i > 0 && /[.?!]$/.test(words[i - 1].text.trim())) {
			start = i;
			key = null;
		}
		if (i >= start && isKey(words[i].text)) key = words[i];
	}
	return key;
};
const EditorialBehindLayer: React.FC = () => {
	const key = useEditorialKey();
	const sp = useSpringAt();
	const s = useStyle(D_EDIT);
	if (!key) return null;
	const k = sp(key.startMs, {damping: 200, stiffness: 120});
	const w = bare(key.text);
	return (
		<Placement anchor={{top: 330}}>
			<div
				style={{
					fontFamily: s.font,
					fontWeight: 700,
					fontSize: Math.min(s.fs(330), s.fs(1350 / Math.max(1, w.length))),
					letterSpacing: s.px(-10),
					lineHeight: 1,
					color: s.accent,
					opacity: k,
					transform: `scale(${interpolate(k, [0, 1], [1.08, 1])})`,
				}}
			>
				{cap1(w)}
			</div>
		</Placement>
	);
};
const EditorialFrontLayer: React.FC = () => {
	const page = usePage(700);
	const t = useTimeMs();
	const isKey = useIsKey();
	const s = useStyle(D_EDIT);
	if (!page) return null;
	const words = page.tokens.filter((x) => !isKey(x.text) && isSpoken(x, t));
	if (!words.length) return null;
	return (
		<Placement anchor={{bottom: 640}}>
			<div style={{fontFamily: s.font, fontWeight: 500, fontSize: s.fs(96), letterSpacing: s.px(-2), color: s.primary, textShadow: '0 4px 18px rgba(0,0,0,0.45)'}}>
				{words.map((w) => bare(w.text).toLowerCase()).join(' ')}
			</div>
		</Placement>
	);
};

const D_BLUR = meta('blur-reveal');
const BlurReveal: React.FC = () => {
	const page = usePage(1400);
	const t = useTimeMs();
	const s = useStyle(D_BLUR);
	if (!page) return null;
	return (
		<Placement anchor={{bottom: 520, left: 80}}>
			<div style={{display: 'flex', flexDirection: 'column'}}>
				{page.tokens.map((tok) => {
					const word = bare(tok.text).toLowerCase();
					const dur = Math.max(160, tok.toMs - tok.fromMs);
					return (
						<div key={tok.fromMs} style={{display: 'flex', lineHeight: 0.92}}>
							{word.split('').map((ch, ci) => {
								const at = tok.fromMs + (ci / Math.max(1, word.length)) * dur * 0.8;
								const p = interpolate(t, [at, at + 220], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
								return (
									<span
										key={ci}
										style={{
											fontFamily: s.font,
											fontWeight: 500,
											fontSize: s.fs(118),
											letterSpacing: s.px(-4),
											color: s.primary,
											opacity: p,
											filter: `blur(${(1 - p) * 14}px)`,
											transform: `translateX(${(1 - p) * -10}px)`,
											textShadow: '0 2px 16px rgba(0,0,0,0.25)',
										}}
									>
										{ch}
									</span>
								);
							})}
						</div>
					);
				})}
			</div>
		</Placement>
	);
};

// ===================== Registry =====================

export type Preset = PresetMeta & {Front: React.FC; Behind?: React.FC};

const COMPONENTS: Record<string, {Front: React.FC; Behind?: React.FC}> = {
	'dynamic-minimal': {Front: DynamicMinimal},
	'pill-chip': {Front: PillChip},
	'classic-highlight': {Front: ClassicHighlight},
	'typewriter': {Front: Typewriter},
	'color-switch': {Front: ColorSwitch},
	'quiet-lowercase': {Front: QuietLowercase},
	'shorts-clean': {Front: ShortsClean},
	'script-heavy-duo': {Front: ScriptHeavyDuo},
	'smooth-rise': {Front: SmoothRise},
	'safe-zone-chip': {Front: SafeZoneChip},
	'negative-space-glow': {Front: NegativeSpaceGlow},
	'glow-stack': {Front: GlowStack},
	'editorial-behind': {Front: EditorialFrontLayer, Behind: EditorialBehindLayer},
	'blur-reveal': {Front: BlurReveal},
};

export const PRESETS: Preset[] = PRESET_META.map((m) => ({...m, ...COMPONENTS[m.id]}));

export const getPreset = (id: string) => PRESETS.find((p) => p.id === id) ?? PRESETS[0];
