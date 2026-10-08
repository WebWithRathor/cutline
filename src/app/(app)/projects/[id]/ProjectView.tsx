'use client';

import {Player} from '@remotion/player';
import {useRouter} from 'next/navigation';
import {useEffect, useMemo, useState, useTransition} from 'react';
import {StyleEditor} from '@/components/StyleEditor';
import {CaptionedVideo, captionedVideoDurationMs} from '@/remotion/compositions';
import {buildSegments, outputDurationMs} from '@/remotion/timeline';
import type {CaptionStyleChoice, EditPlan, Word} from '@/remotion/types';
import {restyleProject, retryProject} from '../actions';
import {KidsReview} from './KidsReview';

type P = {
	id: string;
	status: string;
	statusLabel: string;
	progress: number;
	error: string | null;
	hasSource: boolean;
	hasOutput: boolean;
	outputVersion: number;
	durationMs: number | null;
	width: number | null;
	height: number | null;
	transcript: Word[] | null;
	plan: EditPlan | null;
	style: CaptionStyleChoice;
	renderer: 'captioned' | 'kids';
};

const WORKING = ['queued', 'transcribing', 'planning', 'rendering'];

export function ProjectView({project: p}: {project: P}) {
	const router = useRouter();
	const working = WORKING.includes(p.status);

	// Poll while the worker is busy; refresh the page when the status changes.
	useEffect(() => {
		if (!working) return;
		const iv = setInterval(async () => {
			const r = await fetch(`/api/projects/${p.id}/status`, {cache: 'no-store'});
			if (!r.ok) return;
			const s = await r.json();
			if (s.status !== p.status || Math.abs(s.progress - p.progress) > 0.04) router.refresh();
		}, 2500);
		return () => clearInterval(iv);
	}, [working, p.id, p.status, p.progress, router]);

	return (
		<div className="mt-8 space-y-10">
			{working && (
				<section className="rounded-xl border border-line bg-surface p-5" aria-live="polite">
					<div className="flex items-center justify-between text-sm">
						<span className="font-semibold">{p.statusLabel}</span>
						<span className="text-muted">{Math.round(p.progress * 100)}%</span>
					</div>
					<div className="mt-3 h-2 overflow-hidden rounded-full bg-fog">
						<div className="h-full rounded-full bg-mark transition-[width] duration-500" style={{width: `${Math.max(4, p.progress * 100)}%`}} />
					</div>
					<p className="mt-3 text-sm text-muted">You can leave this page. The edit keeps going.</p>
				</section>
			)}

			{p.status === 'draft' && (
				<section className="rounded-xl border border-line bg-surface p-5">
					<p className="font-semibold">No video uploaded</p>
					<p className="mt-1 text-sm text-muted">The upload didn’t finish. Delete this and start a new video.</p>
				</section>
			)}

			{p.status === 'failed' && (
				<section className="rounded-xl border border-bad/40 bg-surface p-5">
					<p className="font-semibold text-bad">The edit failed</p>
					<p className="mt-1 text-sm">{p.error ?? 'Unknown error.'}</p>
					<form action={retryProject.bind(null, p.id)}>
						<button className="btn btn-quiet mt-4">Try again</button>
					</form>
				</section>
			)}

			{p.hasOutput && (
				<section className={`grid gap-8 ${p.renderer === 'kids' ? 'md:grid-cols-[minmax(0,560px)_1fr]' : 'md:grid-cols-[minmax(0,320px)_1fr]'}`}>
					<video
						key={p.outputVersion}
						src={`/api/projects/${p.id}/output?v=${p.outputVersion}`}
						controls
						playsInline
						className="w-full rounded-xl bg-ink"
						style={{aspectRatio: p.renderer === 'kids' ? '16 / 9' : p.width && p.height ? `${p.width} / ${p.height}` : '9 / 16'}}
					/>
					<div>
						<h2 className="h-display text-xl">Your edit</h2>
						{p.plan && p.durationMs && p.renderer === 'captioned' && <PlanSummary plan={p.plan} durationMs={p.durationMs} />}
						<a href={`/api/projects/${p.id}/output?download`} className="btn btn-primary mt-6">Download MP4</a>
					</div>
				</section>
			)}

			{p.renderer === 'kids' && p.transcript && p.plan && p.durationMs && p.hasSource && (p.status === 'review' || p.status === 'done') && (
				<KidsReview id={p.id} words={p.transcript} plan={p.plan} durationMs={p.durationMs} mode={p.status === 'review' ? 'review' : 'done'} />
			)}

			{p.renderer === 'captioned' && p.transcript && p.plan && p.durationMs && p.hasSource && !working && (
				<Restyle id={p.id} initial={p.style} transcript={p.transcript} plan={p.plan} durationMs={p.durationMs} width={p.width ?? 1080} height={p.height ?? 1920} />
			)}
		</div>
	);
}

function PlanSummary({plan, durationMs}: {plan: EditPlan; durationMs: number}) {
	const out = outputDurationMs(buildSegments(plan.keepRanges, durationMs));
	const saved = Math.max(0, (durationMs - out) / 1000);
	return (
		<dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
			<div>
				<dt className="text-muted">Length</dt>
				<dd className="mt-0.5 font-semibold">{(out / 1000).toFixed(1)}s</dd>
			</div>
			<div>
				<dt className="text-muted">Trimmed</dt>
				<dd className="mt-0.5 font-semibold">{saved.toFixed(1)}s</dd>
			</div>
			<div>
				<dt className="text-muted">Zooms</dt>
				<dd className="mt-0.5 font-semibold">{plan.zooms.length}</dd>
			</div>
			{plan.hook && (
				<div className="col-span-full">
					<dt className="text-muted">Hook</dt>
					<dd className="mt-0.5 font-semibold">{plan.hook}</dd>
				</div>
			)}
			{plan.keywords.length > 0 && (
				<div className="col-span-full">
					<dt className="text-muted">Highlighted words</dt>
					<dd className="mt-1.5 flex flex-wrap gap-1.5">
						{plan.keywords.map((k) => (
							<span key={k} className="rounded-md bg-mark px-2 py-0.5 font-medium">{k}</span>
						))}
					</dd>
				</div>
			)}
		</dl>
	);
}

function Restyle(props: {id: string; initial: CaptionStyleChoice; transcript: Word[]; plan: EditPlan; durationMs: number; width: number; height: number}) {
	const [style, setStyle] = useState(props.initial);
	const [error, setError] = useState<string | null>(null);
	const [pending, start] = useTransition();
	const router = useRouter();
	const changed = JSON.stringify(style) !== JSON.stringify(props.initial);
	const inputProps = useMemo(
		() => ({
			src: `/api/projects/${props.id}/source`,
			sourceDurationMs: props.durationMs,
			words: props.transcript,
			plan: props.plan,
			style,
			hookText: props.plan.hook,
			preview: true,
		}),
		[props.id, props.durationMs, props.transcript, props.plan, style],
	);
	const frames = Math.max(1, Math.round((captionedVideoDurationMs(inputProps) / 1000) * 30));

	return (
		<section>
			<h2 className="h-display text-xl">Change the captions</h2>
			<p className="mt-1 text-sm text-muted">The preview plays your real video. Re-rendering reuses the transcript and cuts, so it only takes a render.</p>
			<div className="mt-5">
				<StyleEditor
					value={style}
					onChange={setStyle}
					preview={
						<Player
							component={CaptionedVideo}
							inputProps={inputProps}
							durationInFrames={frames}
							fps={30}
							compositionWidth={props.width}
							compositionHeight={props.height}
							controls
							loop
							acknowledgeRemotionLicense
							style={{width: '100%', aspectRatio: `${props.width} / ${props.height}`, borderRadius: 14, overflow: 'hidden'}}
						/>
					}
				/>
			</div>
			<div className="mt-6 flex flex-wrap items-center gap-4">
				<button
					type="button"
					className="btn btn-primary"
					disabled={!changed || pending}
					onClick={() =>
						start(async () => {
							setError(null);
							const r = await restyleProject(props.id, style);
							if (r.error) setError(r.error);
							else router.refresh();
						})
					}
				>
					{pending ? 'Starting…' : 'Re-render with this style'}
				</button>
				{error && <p role="alert" className="text-sm text-bad">{error}</p>}
			</div>
		</section>
	);
}
