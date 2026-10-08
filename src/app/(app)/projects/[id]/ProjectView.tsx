'use client';

import {useRouter} from 'next/navigation';
import {useEffect, useState} from 'react';
import type {Activity} from '@/lib/activity';
import {getGrade, type BrollMode} from '@/remotion/fx/meta';
import {buildSegments, outputDurationMs} from '@/remotion/timeline';
import type {CaptionStyleChoice, CreativeBrief, EditPlan, Word} from '@/remotion/types';
import {retryProject} from '../actions';
import {KidsReview} from './KidsReview';
import {ProcessTimeline} from './ProcessTimeline';
import {Storyboard} from './Storyboard';

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
	creative: CreativeBrief | null;
	hasHiggsfield: boolean;
	brollMode: BrollMode;
	activity: Activity | null;
	renderer: 'captioned' | 'kids';
};

const WORKING = ['queued', 'transcribing', 'analyzing', 'planning', 'generating', 'rendering'];

export function ProjectView({project: p}: {project: P}) {
	const router = useRouter();
	const working = WORKING.includes(p.status);

	// polled updates land here; a server refresh (new props) takes over again
	const [activity, setActivity] = useState(p.activity);
	const [fromServer, setFromServer] = useState(p.activity);
	if (fromServer !== p.activity) {
		setFromServer(p.activity);
		setActivity(p.activity);
	}

	// Poll while work is running: the live log updates in place; the page refreshes when the status changes.
	useEffect(() => {
		if (!working) return;
		const iv = setInterval(async () => {
			const r = await fetch(`/api/projects/${p.id}/status`, {cache: 'no-store'});
			if (!r.ok) return;
			const s = await r.json();
			if (s.activity) setActivity(s.activity);
			if (s.status !== p.status) router.refresh();
		}, 1500);
		return () => clearInterval(iv);
	}, [working, p.id, p.status, router]);

	return (
		<div className="mt-8 space-y-10">
			{working &&
				(activity?.steps?.length ? (
					<div>
						<ProcessTimeline activity={activity} live />
						<p className="mt-2 text-sm text-muted">You can leave this page. The edit keeps going.</p>
					</div>
				) : (
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
				))}

			{!working && activity?.steps?.length ? (
				p.status === 'failed' ? (
					<ProcessTimeline activity={activity} live={false} />
				) : (
					<details className="group rounded-xl border border-line bg-surface">
						<summary className="cursor-pointer px-5 py-4 text-sm font-semibold">How this video was made: every step and its log</summary>
						<div className="border-t border-line p-2">
							<ProcessTimeline activity={activity} live={false} />
						</div>
					</details>
				)
			) : null}

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
				<KidsReview id={p.id} words={p.transcript} plan={p.plan} durationMs={p.durationMs} creative={p.creative} mode={p.status === 'review' ? 'review' : 'done'} />
			)}

			{p.renderer === 'captioned' && p.transcript && p.plan && p.durationMs && p.hasSource && !working && p.status !== 'draft' && (
				<Storyboard
					id={p.id}
					words={p.transcript}
					plan={p.plan}
					durationMs={p.durationMs}
					width={p.width ?? 1080}
					height={p.height ?? 1920}
					style={p.style}
					creative={p.creative}
					hasHiggsfield={p.hasHiggsfield}
					brollMode={p.brollMode}
					mode={p.status === 'review' ? 'review' : 'done'}
				/>
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
			<div>
				<dt className="text-muted">B-roll</dt>
				<dd className="mt-0.5 font-semibold">{plan.broll?.length ?? 0}</dd>
			</div>
			<div>
				<dt className="text-muted">Effects / sounds</dt>
				<dd className="mt-0.5 font-semibold">
					{plan.vfx?.length ?? 0} / {plan.sfx?.length ?? 0}
				</dd>
			</div>
			{plan.grade && (
				<div>
					<dt className="text-muted">Grade</dt>
					<dd className="mt-0.5 font-semibold">{getGrade(plan.grade).name}</dd>
				</div>
			)}
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
