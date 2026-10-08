import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {db, schema} from '@/lib/db';
import type {CaptionedVideoProps} from '@/remotion/compositions';
import type {KidsExplainerProps} from '@/remotion/kids/KidsExplainer';
import {getVariant} from '@/variants';
import {mediaUrl, removeKey, storageMode} from './storage';

// Where renders run: a Vercel Sandbox in production (needs Blob storage), the local worker otherwise.
export const renderMode: 'vercel' | 'local' = process.env.RENDERER === 'local' ? 'local' : process.env.RENDERER === 'vercel' || process.env.VERCEL ? 'vercel' : 'local';

type Project = typeof schema.project.$inferSelect;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

// The composition and props for a project. Shared by both render paths.
export async function renderInput(p: Project): Promise<{compositionId: string; inputProps: Record<string, unknown>}> {
	if (!p.sourceKey || !p.transcript || !p.plan) throw new Error('Project is not ready to render');
	const src = await mediaUrl(p.sourceKey);
	const sourceDurationMs = (p.durationSec ?? 0) * 1000;
	const variant = getVariant(p.variantId);
	if (variant?.renderer === 'kids') {
		return {compositionId: 'KidsExplainer', inputProps: {src, sourceDurationMs, words: p.transcript, plan: p.plan} satisfies KidsExplainerProps};
	}
	return {
		compositionId: 'CaptionedVideo',
		inputProps: {
			src,
			sourceDurationMs,
			words: p.transcript,
			plan: p.plan,
			style: p.captionStyle,
			hookText: p.brief.hook === false ? undefined : p.plan.hook,
			width: even(p.width ?? 1080),
			height: even(p.height ?? 1920),
		} satisfies CaptionedVideoProps & {width: number; height: number},
	};
}

async function setProject(id: string, patch: Partial<typeof schema.project.$inferInsert>) {
	await db.update(schema.project).set(patch).where(eq(schema.project.id, id));
}

export async function startRender(projectId: string) {
	const [p] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
	if (!p) return;
	await setProject(projectId, {status: 'rendering', progress: 0.02, error: null});

	if (renderMode === 'local') {
		await db.insert(schema.job).values({id: randomUUID(), projectId, mode: 'render'});
		return;
	}

	if (storageMode !== 'blob') throw new Error('Vercel rendering needs Vercel Blob storage (BLOB_READ_WRITE_TOKEN).');
	const {renderMediaOnVercel} = await import('@remotion/vercel');
	const {restoreSnapshotSandbox} = await import('./sandbox');
	const {compositionId, inputProps} = await renderInput(p);
	const sandbox = await restoreSnapshotSandbox();
	const {sandboxId, cmdId} = await renderMediaOnVercel({
		sandbox,
		compositionId,
		inputProps,
		codec: 'h264',
		crf: 20,
		detached: true,
		detachedSandboxTimeoutInMilliseconds: 40 * 60 * 1000,
		vercelBlob: {
			blobToken: process.env.BLOB_READ_WRITE_TOKEN!,
			access: 'private',
			blobPath: `projects/${projectId}/output-${randomUUID().slice(0, 8)}.mp4`,
		},
	});
	await setProject(projectId, {renderSandboxId: sandboxId, renderCmdId: cmdId, progress: 0.05});
}

// Vercel renders run detached; the status endpoint calls this to advance them.
export async function pollRender(p: Project) {
	if (renderMode !== 'vercel' || p.status !== 'rendering' || !p.renderSandboxId || !p.renderCmdId) return;
	const {getRenderProgress} = await import('@remotion/vercel');
	const pr = await getRenderProgress({sandboxId: p.renderSandboxId, cmdId: p.renderCmdId});
	if (pr.stage === 'done') {
		if (p.outputKey) await removeKey(p.outputKey);
		await setProject(p.id, {status: 'done', progress: 1, outputKey: new URL(pr.url).pathname.slice(1), renderSandboxId: null, renderCmdId: null});
		await stopSandbox(p.renderSandboxId);
	} else if (pr.stage === 'error' || pr.stage === 'expired') {
		await setProject(p.id, {status: 'failed', error: pr.stage === 'error' ? `Render failed: ${pr.message}` : 'The render took too long and was stopped.', renderSandboxId: null, renderCmdId: null});
		await stopSandbox(p.renderSandboxId);
	} else {
		await setProject(p.id, {progress: Math.max(0.05, Math.min(0.99, pr.overallProgress))});
	}
}

async function stopSandbox(sandboxId: string) {
	const {Sandbox} = await import('@vercel/sandbox');
	await Sandbox.get({sandboxId})
		.then((s) => s.stop())
		.catch(() => undefined);
}
