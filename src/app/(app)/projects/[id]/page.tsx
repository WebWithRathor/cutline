import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {listKeys} from '@/lib/keys';
import {brollModeOf} from '@/remotion/fx/meta';
import {STATUS_LABEL, getOwnedProject} from '@/lib/projects';
import {getVariant} from '@/variants';
import {deleteProject} from '../actions';
import {ProjectView} from './ProjectView';

// approving / re-planning start background work from server actions on this page
export const maxDuration = 300;

export async function generateMetadata(props: PageProps<'/projects/[id]'>): Promise<Metadata> {
	const user = await requireUser();
	const p = await getOwnedProject(user.id, (await props.params).id);
	return {title: p?.title ?? 'Video'};
}

export default async function ProjectPage(props: PageProps<'/projects/[id]'>) {
	const user = await requireUser();
	const {id} = await props.params;
	const p = await getOwnedProject(user.id, id);
	if (!p) notFound();
	const variant = getVariant(p.variantId);
	const hasHiggsfield = (await listKeys(user.id)).some((k) => k.provider === 'higgsfield');

	return (
		<div className="max-w-5xl">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="h-display truncate text-3xl">{p.title}</h1>
					<p className="mt-1 text-sm text-muted">{[variant?.name, p.sourceName].filter(Boolean).join(', ')}</p>
				</div>
				<form action={deleteProject}>
					<input type="hidden" name="id" value={p.id} />
					<button className="btn btn-quiet text-bad">Delete video</button>
				</form>
			</div>
			<ProjectView
				project={{
					id: p.id,
					status: p.status,
					statusLabel: STATUS_LABEL[p.status],
					progress: p.progress,
					error: p.error,
					hasSource: Boolean(p.sourceKey),
					hasOutput: Boolean(p.outputKey),
					outputVersion: p.updatedAt.getTime(),
					durationMs: p.durationSec ? p.durationSec * 1000 : null,
					width: p.width,
					height: p.height,
					transcript: p.transcript ?? null,
					plan: p.plan ?? null,
					style: p.captionStyle,
					creative: p.creative ?? null,
					hasHiggsfield,
					brollMode: brollModeOf(p.brief.broll),
					activity: p.activity ?? null,
					renderer: variant?.renderer ?? 'captioned',
				}}
			/>
		</div>
	);
}
