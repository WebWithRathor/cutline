'use client';

import {useEffect, useState} from 'react';
import type {Activity, Step} from '@/lib/activity';

const clock = (ms: number) => {
	const s = Math.max(0, Math.round(ms / 1000));
	return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};
const time = (t: number) => new Date(t).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'});

function Icon({status}: {status: Step['status']}) {
	const base = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold';
	if (status === 'done') return <span className={`${base} bg-mark text-ink`} aria-label="Done">✓</span>;
	if (status === 'failed') return <span className={`${base} bg-bad text-white`} aria-label="Failed">!</span>;
	if (status === 'running')
		return (
			<span className={`${base} bg-ink`} aria-label="Running">
				<span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-mark border-t-transparent" />
			</span>
		);
	if (status === 'waiting') return <span className={`${base} animate-pulse bg-mark text-ink`} aria-label="Waiting for you">●</span>;
	if (status === 'skipped') return <span className={`${base} border border-dashed border-line text-muted`} aria-label="Skipped">–</span>;
	return <span className={`${base} border border-line bg-surface text-muted`} aria-label="Pending" />;
}

// The pipeline as a live checklist: each step, who runs it, what it is doing right now, and its log.
export function ProcessTimeline({activity, live}: {activity: Activity; live: boolean}) {
	const [now, setNow] = useState(() => Date.now());
	const [open, setOpen] = useState<Record<string, boolean>>({});
	useEffect(() => {
		if (!live) return;
		const iv = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(iv);
	}, [live]);

	const steps = activity.steps;
	const started = Math.min(...steps.map((s) => s.startedAt ?? Infinity));
	const ended = Math.max(...steps.map((s) => s.endedAt ?? 0));
	const running = steps.find((s) => s.status === 'running');

	return (
		<section className="rounded-xl border border-line bg-surface p-5" aria-live="polite">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h2 className="font-semibold">{running ? running.label : steps.some((s) => s.status === 'failed') ? 'Stopped' : steps.some((s) => s.status === 'waiting') ? 'Waiting for you' : 'Pipeline'}</h2>
				{Number.isFinite(started) && <span className="text-xs tabular-nums text-muted">Total {clock((live ? now : ended || now) - started)}</span>}
			</div>
			<ol className="mt-4">
				{steps.map((s, i) => {
					const showLog = open[s.key] ?? s.status === 'running';
					const elapsed = s.startedAt ? (s.endedAt ?? (s.status === 'running' ? now : s.startedAt)) - s.startedAt : 0;
					return (
						<li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
							{i < steps.length - 1 && <span className="absolute left-[13px] top-8 bottom-0 w-px bg-line" aria-hidden />}
							<Icon status={s.status} />
							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-baseline justify-between gap-x-3">
									<p className={`text-sm font-semibold ${s.status === 'pending' || s.status === 'skipped' ? 'text-muted' : ''}`}>
										{s.label} <span className="font-normal text-muted">· {s.who}</span>
									</p>
									{s.startedAt && s.status !== 'waiting' && <span className="text-xs tabular-nums text-muted">{clock(elapsed)}</span>}
								</div>
								{s.detail && <p className={`mt-0.5 text-sm ${s.status === 'failed' ? 'text-bad' : 'text-muted'}`}>{s.detail}</p>}
								{s.status === 'running' && s.progress !== undefined && (
									<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fog">
										<div className="h-full rounded-full bg-mark transition-[width] duration-500" style={{width: `${Math.max(3, s.progress * 100)}%`}} />
									</div>
								)}
								{s.events.length > 0 && (
									<>
										<button type="button" className="mt-1.5 text-xs font-medium text-muted underline underline-offset-2" onClick={() => setOpen((o) => ({...o, [s.key]: !showLog}))}>
											{showLog ? 'Hide log' : `Show log (${s.events.length})`}
										</button>
										{showLog && (
											<ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg bg-ink p-3 font-mono text-xs leading-5 text-white/85">
												{s.events.map((e, k) => (
													<li key={k} className="flex gap-2">
														<span className="shrink-0 text-white/40">{time(e.t)}</span>
														<span className="min-w-0 break-words">{e.msg}</span>
													</li>
												))}
											</ul>
										)}
									</>
								)}
							</div>
						</li>
					);
				})}
			</ol>
		</section>
	);
}
