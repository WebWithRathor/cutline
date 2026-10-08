'use client';

import {Player} from '@remotion/player';
import {useRouter} from 'next/navigation';
import {useMemo, useState, useTransition} from 'react';
import {KIDS_FPS, KIDS_H, KIDS_W, KidsExplainer, kidsDurationMs} from '@/remotion/kids/KidsExplainer';
import {SFX_META} from '@/remotion/fx/meta';
import type {CreativeBrief, EditPlan, KidsShot, Word} from '@/remotion/types';
import {approvePlan, replanProject} from '../actions';
import {CreativeBriefCard} from './CreativeBriefCard';

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

const CHAR_NAME: Record<string, string> = {kiko: 'Kiko', sparky: 'Sparky', ohmie: 'Ohmie', zips: 'the Zips', batt: 'Batt', grandpaBulb: 'Grandpa Bulb'};

function describe(s: KidsShot): string {
	if (s.kind === 'camera') {
		const o = s.overlay;
		if (!o) return 'Camera';
		if (o.type === 'hello') return `Camera, Kiko says “${o.text}”`;
		if (o.type === 'count') return `Camera, Kiko holds a “${o.sign}” sign`;
		if (o.type === 'nextTime') return `Camera, next video card: ${o.title}${o.guest ? ` with ${CHAR_NAME[o.guest]}` : ''}`;
		return `Camera, stickers: ${o.items.map((i) => i.label).join(', ')}`;
	}
	const sc = s.scene;
	if (sc.type === 'doDont') return `Cutaway “${sc.label}”: ${CHAR_NAME[sc.character]} right way vs wrong way`;
	if (sc.type === 'justRight') return `Cutaway “${sc.label}”: ${CHAR_NAME[sc.character]} too much, too little, just right`;
	const who = sc.actors.map((a) => `${CHAR_NAME[a.character]}${a.mood ? ` (${a.mood})` : ''}`).join(', ');
	return `Cutaway${sc.label ? ` “${sc.label}”` : ''}: ${who}${sc.bubble ? `, bubble “${sc.bubble.text}”` : ''}${sc.title ? `, title “${sc.title.text}”` : ''}`;
}

// Sound effects that land within a shot.
const sounds = (plan: EditPlan, s: KidsShot, nextStart: number) =>
	(plan.sfx ?? []).filter((x) => x.atWord >= s.startWord && x.atWord < nextStart).map((x) => SFX_META[x.sound].name);

// Kit Student: the storyboard is the takes and the beat plan, with a live preview. Nothing renders until it's approved.
export function KidsReview({id, words, plan, durationMs, creative, mode}: {id: string; words: Word[]; plan: EditPlan; durationMs: number; creative: CreativeBrief | null; mode: 'review' | 'done'}) {
	const router = useRouter();
	const [notes, setNotes] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();
	const [action, setAction] = useState<'approve' | 'replan' | null>(null);

	const removed = useMemo(() => {
		const m = new Map<number, string>();
		for (const r of plan.removed ?? []) for (let i = r.from; i <= r.to; i++) m.set(i, r.reason);
		return m;
	}, [plan.removed]);
	const inputProps = useMemo(() => ({src: `/api/projects/${id}/source`, sourceDurationMs: durationMs, words, plan, preview: true}), [id, durationMs, words, plan]);
	const outMs = kidsDurationMs(inputProps);
	const frames = Math.max(1, Math.round((outMs / 1000) * KIDS_FPS));

	const run = (kind: 'approve' | 'replan') =>
		start(async () => {
			setError(null);
			setAction(kind);
			const r = kind === 'approve' ? await approvePlan(id) : await replanProject(id, notes);
			if (r.error) setError(r.error);
			else {
				setNotes('');
				router.refresh();
			}
		});

	return (
		<section className="space-y-8">
			<div>
				<h2 className="h-display text-xl">{mode === 'review' ? 'Storyboard: approve it to start the edit' : 'The storyboard behind this edit'}</h2>
				<p className="mt-1 text-sm text-muted">
					{fmt(durationMs)} recorded, {fmt(outMs)} after cuts. {plan.shots?.length ?? 0} shots. The preview uses your real clip and the kit’s drawings; the rendered
					video looks the same.
				</p>
			</div>

			{creative && <CreativeBriefCard creative={creative} kids />}

			<div className="overflow-hidden rounded-xl bg-ink">
				<Player
					component={KidsExplainer}
					inputProps={inputProps}
					durationInFrames={frames}
					fps={KIDS_FPS}
					compositionWidth={KIDS_W}
					compositionHeight={KIDS_H}
					controls
					acknowledgeRemotionLicense
					style={{width: '100%', aspectRatio: '16 / 9'}}
				/>
			</div>

			<div className="grid gap-8 lg:grid-cols-2">
				<div>
					<h3 className="font-semibold">Shots</h3>
					<ol className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
						{(plan.shots ?? []).map((s, i) => (
							<li key={i} className="flex gap-3 px-4 py-3 text-sm">
								<span className="w-12 shrink-0 tabular-nums text-muted">{fmt(words[s.startWord]?.startMs ?? 0)}</span>
								<span className={`mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${s.kind === 'camera' ? 'bg-fog' : 'bg-mark'}`}>{s.kind === 'camera' ? 'Camera' : 'Cutaway'}</span>
								<span>
									{describe(s)}
									{s.why && <span className="mt-0.5 block text-xs text-muted">{s.why}</span>}
									{sounds(plan, s, plan.shots?.[i + 1]?.startWord ?? words.length).map((name, k) => (
										<span key={k} className="mr-1 mt-1 inline-block rounded-md bg-fog px-1.5 py-0.5 text-xs">
											Sound: {name}
										</span>
									))}
								</span>
							</li>
						))}
					</ol>
				</div>
				<div>
					<h3 className="font-semibold">Takes</h3>
					<p className="mt-1 text-sm text-muted">Struck-through words are cut: repeated takes, false starts, slips and fillers. Gold words get the keyword style.</p>
					<p className="mt-3 max-h-[28rem] overflow-y-auto rounded-xl border border-line bg-surface p-4 text-sm leading-7">
						{words.map((w, i) => {
							const reason = removed.get(i);
							const key = plan.keywords.includes(w.text.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase());
							return (
								<span key={i}>
									<span
										title={reason ? `Cut: ${reason}` : undefined}
										className={reason ? 'text-muted line-through decoration-bad' : key ? 'rounded bg-mark px-0.5 font-semibold' : ''}
									>
										{w.text}
									</span>{' '}
								</span>
							);
						})}
					</p>
				</div>
			</div>

			<div className="rounded-xl border border-line bg-surface p-5">
				<label className="label" htmlFor="notes">
					{mode === 'review' ? 'Want changes? Tell Claude what to change' : 'Change the plan and render again'}
				</label>
				<textarea
					id="notes"
					rows={3}
					className="field"
					placeholder="e.g. Keep the first take of the intro. Use Batt instead of Kiko for the energy part. Add a Just right beat at the end."
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
				/>
				<div className="mt-4 flex flex-wrap items-center gap-3">
					{mode === 'review' && (
						<button type="button" className="btn btn-primary" disabled={pending} onClick={() => run('approve')}>
							{pending && action === 'approve' ? 'Starting…' : 'Approve storyboard and start the edit'}
						</button>
					)}
					<button type="button" className={mode === 'review' ? 'btn btn-quiet' : 'btn btn-primary'} disabled={pending || !notes.trim()} onClick={() => run('replan')}>
						{pending && action === 'replan' ? 'Sending…' : 'Revise the storyboard'}
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
