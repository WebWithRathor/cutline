'use client';

import {Player, Thumbnail} from '@remotion/player';
import {useRouter} from 'next/navigation';
import {useMemo, useState, useTransition} from 'react';
import {StyleEditor} from '@/components/StyleEditor';
import {buildStoryboard, fmtTime, type Panel} from '@/lib/storyboard';
import {getPresetMeta} from '@/remotion/captions/meta';
import {CaptionedVideo, captionedVideoDurationMs, type CaptionedVideoProps} from '@/remotion/compositions';
import {BROLL_META, BROLL_MODE_META, GRADES, SFX_META, VFX_META, type BrollMode} from '@/remotion/fx/meta';
import {BROLL_SOURCES, type BrollSource, type CaptionStyleChoice, type CreativeBrief, type EditPlan, type GradeId, type Word} from '@/remotion/types';
import {approvePlan, editStoryboard, replanProject, restyleProject} from '../actions';
import {CreativeBriefCard} from './CreativeBriefCard';

const FPS = 30;

type Props = {
	id: string;
	words: Word[];
	plan: EditPlan;
	durationMs: number;
	width: number;
	height: number;
	style: CaptionStyleChoice;
	creative: CreativeBrief | null;
	hasHiggsfield: boolean;
	brollMode: BrollMode;
	mode: 'review' | 'done';
};

// Talking head: everything Gemini and Claude chose, laid out panel by panel. Nothing is generated or rendered until it's approved.
export function Storyboard(props: Props) {
	const {id, words, plan, durationMs, width, height, style, creative, mode} = props;
	const router = useRouter();
	const [notes, setNotes] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();
	const [busy, setBusy] = useState<string | null>(null);
	const [draftStyle, setDraftStyle] = useState(style);

	const panels = useMemo(() => buildStoryboard(plan, words, durationMs), [plan, words, durationMs]);
	const inputProps: CaptionedVideoProps = useMemo(
		() => ({src: `/api/projects/${id}/source`, sourceDurationMs: durationMs, words, plan, style, hookText: plan.hook, palette: creative?.palette, preview: true}),
		[id, durationMs, words, plan, style, creative],
	);
	const outMs = captionedVideoDurationMs(inputProps);
	const frames = Math.max(1, Math.round((outMs / 1000) * FPS));

	const act = (key: string, fn: () => Promise<{error?: string}>, after?: () => void) =>
		start(async () => {
			setError(null);
			setBusy(key);
			const r = await fn();
			setBusy(null);
			if (r.error) setError(r.error);
			else {
				after?.();
				router.refresh();
			}
		});

	const broll = plan.broll ?? [];
	const counts = BROLL_SOURCES.map((s) => [s, broll.filter((b) => b.source === s).length] as const).filter(([, n]) => n);
	const paid = broll.filter((b) => b.source === 'higgsfield').length;

	return (
		<section className="space-y-8">
			<div>
				<h2 className="h-display text-xl">{mode === 'review' ? 'Storyboard: approve it to start the edit' : 'The storyboard behind this edit'}</h2>
				<p className="mt-1 text-sm text-muted">
					{fmtTime(durationMs)} recorded, {fmtTime(outMs)} after cuts. {panels.length} panels
					{counts.length ? `, B-roll: ${counts.map(([s, n]) => `${n} ${BROLL_META[s].name}`).join(', ')}` : ''}.{' '}
					{mode === 'review' && 'Nothing is generated or rendered until you approve.'}
					{mode === 'review' && paid > 0 && ` Approving uses Higgsfield credits for ${paid} clip${paid > 1 ? 's' : ''}.`}
				</p>
			</div>

			{creative && <CreativeBriefCard creative={creative} />}

			<div className="grid gap-8 lg:grid-cols-[minmax(0,340px)_1fr]">
				<div>
					<Player
						component={CaptionedVideo}
						inputProps={inputProps}
						durationInFrames={frames}
						fps={FPS}
						compositionWidth={width}
						compositionHeight={height}
						controls
						acknowledgeRemotionLicense
						style={{width: '100%', aspectRatio: `${width} / ${height}`, borderRadius: 14, overflow: 'hidden'}}
					/>
					<p className="hint">Preview of the whole edit. HyperFrames and Higgsfield clips show their card here until they are generated.</p>
				</div>
				<div className="space-y-5">
					<div>
						<label className="label" htmlFor="grade">Colour grade</label>
						<select
							id="grade"
							className="field"
							value={plan.grade ?? 'natural'}
							disabled={pending}
							onChange={(e) => act('grade', () => editStoryboard(id, {kind: 'grade', grade: e.target.value as GradeId}))}
						>
							{GRADES.map((g) => (
								<option key={g.id} value={g.id}>
									{g.name}: {g.description}
								</option>
							))}
						</select>
					</div>
					<details className="rounded-xl border border-line bg-surface p-4">
						<summary className="cursor-pointer text-sm font-semibold">Captions: {getPresetMeta(style.presetId).name} (change)</summary>
						<div className="mt-4">
							<StyleEditor value={draftStyle} onChange={setDraftStyle} />
							<button
								type="button"
								className="btn btn-quiet mt-4"
								disabled={pending || JSON.stringify(draftStyle) === JSON.stringify(style)}
								onClick={() => act('style', () => restyleProject(id, draftStyle))}
							>
								{busy === 'style' ? 'Saving…' : mode === 'review' ? 'Use this caption style' : 'Re-render with this style'}
							</button>
						</div>
					</details>
				</div>
			</div>

			<ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{panels.map((p) => (
					<PanelCard key={p.n} panel={p} {...props} inputProps={inputProps} frames={frames} pending={pending} act={act} />
				))}
			</ol>

			<div className="rounded-xl border border-line bg-surface p-5">
				<label className="label" htmlFor="notes">
					{mode === 'review' ? 'Want changes? Tell Claude what to change in the storyboard' : 'Change the storyboard and plan again'}
				</label>
				<textarea
					id="notes"
					rows={3}
					className="field"
					placeholder="e.g. Keep the first take of the intro. Replace panel 4's card with AI footage of a busy café. Fewer sound effects. Use a warmer grade."
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
				/>
				<div className="mt-4 flex flex-wrap items-center gap-3">
					{mode === 'review' && (
						<button type="button" className="btn btn-primary" disabled={pending} onClick={() => act('approve', () => approvePlan(id))}>
							{busy === 'approve' ? 'Starting…' : 'Approve storyboard and start the edit'}
						</button>
					)}
					<button
						type="button"
						className={mode === 'review' ? 'btn btn-quiet' : 'btn btn-primary'}
						disabled={pending || !notes.trim()}
						onClick={() => act('replan', () => replanProject(id, notes), () => setNotes(''))}
					>
						{busy === 'replan' ? 'Sending…' : 'Revise the storyboard'}
					</button>
					{error && (
						<p role="alert" className="text-sm text-bad">
							{error}
						</p>
					)}
				</div>
			</div>
		</section>
	);
}

function PanelCard({
	panel: p,
	id,
	plan,
	width,
	height,
	hasHiggsfield,
	brollMode,
	mode,
	inputProps,
	frames,
	pending,
	act,
}: Props & {
	panel: Panel;
	inputProps: CaptionedVideoProps;
	frames: number;
	pending: boolean;
	act: (key: string, fn: () => Promise<{error?: string}>) => void;
}) {
	const b = p.broll;
	// a frame a little into the panel, so B-roll cards and captions have animated in
	const frame = Math.min(frames - 1, Math.round(((p.startMs + Math.min(1200, (p.endMs - p.startMs) * 0.45)) / 1000) * FPS));
	const editable = mode === 'review';
	const keywordSet = new Set(p.keywords);
	return (
		<li className="overflow-hidden rounded-xl border border-line bg-surface">
			<div className="relative bg-ink">
				<Thumbnail
					component={CaptionedVideo}
					inputProps={inputProps}
					frameToDisplay={frame}
					durationInFrames={frames}
					fps={FPS}
					compositionWidth={width}
					compositionHeight={height}
					style={{width: '100%', aspectRatio: `${width} / ${height}`, maxHeight: 360}}
				/>
				<span className="absolute left-2 top-2 rounded-md bg-ink/80 px-2 py-0.5 text-xs font-semibold text-white">
					{p.n} · {fmtTime(p.startMs)}–{fmtTime(p.endMs)}
				</span>
			</div>
			<div className="space-y-3 p-4 text-sm">
				<div>
					<p className="text-xs font-semibold uppercase tracking-wide text-muted">Seen</p>
					{b ? (
						<div className="mt-1">
							<p>
								<span className="mr-1.5 rounded bg-mark px-1.5 py-0.5 text-xs font-semibold">B-roll · {BROLL_META[b.source].name}</span>
								{b.source === 'remotion' ? `${b.card.type} card: “${b.card.title}”` : (b.prompt ?? b.card.title)}
							</p>
							{b.why && <p className="mt-1 text-xs text-muted">{b.why}</p>}
							{b.error && <p className="mt-1 text-xs text-bad">Last generation failed, the card was used: {b.error}</p>}
							{editable && (
								<div className="mt-2 flex flex-wrap items-center gap-2">
									<label className="sr-only" htmlFor={`src-${b.id}`}>B-roll source</label>
									<select
										id={`src-${b.id}`}
										className="field !w-auto !py-1 text-xs"
										value={b.source}
										disabled={pending}
										onChange={(e) => act(`src-${b.id}`, () => editStoryboard(id, {kind: 'brollSource', cueId: b.id, source: e.target.value as BrollSource}))}
									>
										{BROLL_MODE_META[brollMode].sources.map((s) => (
											<option key={s} value={s} disabled={s === 'higgsfield' && !hasHiggsfield}>
												{BROLL_META[s].name} ({BROLL_META[s].cost})
											</option>
										))}
									</select>
									<button type="button" className="text-xs text-bad underline underline-offset-2" disabled={pending} onClick={() => act(`rm-${b.id}`, () => editStoryboard(id, {kind: 'removeBroll', cueId: b.id}))}>
										Remove B-roll
									</button>
								</div>
							)}
						</div>
					) : (
						<p className="mt-1">
							Speaker on camera{p.zoom ? ', punch-in zoom' : ''}
							{p.hook ? `, hook title “${p.hook}”` : ''}
						</p>
					)}
				</div>
				<div>
					<p className="text-xs font-semibold uppercase tracking-wide text-muted">Heard</p>
					<p className="mt-1 leading-6">
						{p.said.split(' ').map((w, i) => (
							<span key={i} className={keywordSet.has(w.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase()) ? 'rounded bg-mark px-0.5 font-semibold' : ''}>
								{w}{' '}
							</span>
						))}
					</p>
				</div>
				{(p.vfx.length > 0 || p.sfx.length > 0) && (
					<div>
						<p className="text-xs font-semibold uppercase tracking-wide text-muted">Effects</p>
						<ul className="mt-1.5 flex flex-wrap gap-1.5">
							{p.vfx.map((v) => {
								const index = (plan.vfx ?? []).indexOf(v);
								return (
									<Chip key={`v${index}`} label={`VFX: ${VFX_META[v.type].name}`} editable={editable} disabled={pending} onRemove={() => act(`v${index}`, () => editStoryboard(id, {kind: 'removeVfx', index}))} />
								);
							})}
							{p.sfx.map((s) => {
								const index = (plan.sfx ?? []).indexOf(s);
								return (
									<Chip key={`s${index}`} label={`Sound: ${SFX_META[s.sound].name}`} editable={editable} disabled={pending} onRemove={() => act(`s${index}`, () => editStoryboard(id, {kind: 'removeSfx', index}))} />
								);
							})}
						</ul>
					</div>
				)}
			</div>
		</li>
	);
}

function Chip({label, editable, disabled, onRemove}: {label: string; editable: boolean; disabled: boolean; onRemove: () => void}) {
	return (
		<li className="flex items-center gap-1 rounded-md bg-fog px-2 py-0.5 text-xs">
			{label}
			{editable && (
				<button type="button" aria-label={`Remove ${label}`} className="ml-0.5 text-muted hover:text-bad" disabled={disabled} onClick={onRemove}>
					×
				</button>
			)}
		</li>
	);
}
