import type {Metadata} from 'next';
import Link from 'next/link';
import {desc, eq} from 'drizzle-orm';
import {requireUser} from '@/lib/auth';
import {db, schema} from '@/lib/db';
import {STATUS_LABEL} from '@/lib/projects';
import {getPresetMeta as getPreset} from '@/remotion/captions/meta';
import {getVariant} from '@/variants';

export const metadata: Metadata = {title: 'Videos'};

const fmtDuration = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : null);

export default async function Dashboard() {
	const user = await requireUser();
	const projects = await db
		.select()
		.from(schema.project)
		.where(eq(schema.project.userId, user.id))
		.orderBy(desc(schema.project.createdAt));

	return (
		<div className="max-w-5xl">
			<h1 className="h-display text-3xl">Videos</h1>
			{projects.length === 0 ? (
				<div className="mt-8 rounded-xl border border-line bg-surface p-8">
					<p className="h-display text-xl">Edit your first video</p>
					<p className="mt-2 max-w-md text-muted">Upload a talking-head clip, pick a caption style, and Cutline returns an edited, captioned version.</p>
					<Link href="/projects/new" className="btn btn-primary mt-5">New video</Link>
				</div>
			) : (
				<ul className="mt-8 divide-y divide-line rounded-xl border border-line bg-surface">
					{projects.map((p) => (
						<li key={p.id}>
							<Link href={`/projects/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-fog/60">
								<div className="min-w-0">
									<p className="truncate font-semibold">{p.title}</p>
									<p className="mt-0.5 text-sm text-muted">
										{[getVariant(p.variantId)?.name, getPreset(p.captionStyle.presetId).name, fmtDuration(p.durationSec)].filter(Boolean).join(', ')}
									</p>
								</div>
								<span
									className={`rounded-md px-2 py-1 text-xs font-semibold ${
										p.status === 'done' ? 'bg-mark text-ink' : p.status === 'failed' ? 'bg-bad/10 text-bad' : 'bg-fog text-muted'
									}`}
								>
									{STATUS_LABEL[p.status]}
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
