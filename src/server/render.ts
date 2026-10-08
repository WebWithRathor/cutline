import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {db, schema} from '@/lib/db';
import type {CaptionedVideoProps} from '@/remotion/compositions';
import type {KidsExplainerProps} from '@/remotion/kids/KidsExplainer';
import {getVariant} from '@/variants';
import {track} from './activity';
import {needsGeneration} from './broll';
import {mediaUrl, removeKey, s3Bucket, storageMode} from './storage';

// Where renders run: Remotion Lambda (AWS) when configured, the local worker otherwise.
const lambdaConfigured = Boolean(process.env.REMOTION_LAMBDA_FUNCTION && process.env.REMOTION_SERVE_URL);
export const renderMode: 'lambda' | 'local' = process.env.RENDERER === 'local' ? 'local' : process.env.RENDERER === 'lambda' || lambdaConfigured ? 'lambda' : 'local';
const lambdaRegion = () => (process.env.REMOTION_AWS_REGION || process.env.S3_REGION || 'us-east-1') as import('@remotion/lambda/client').AwsRegion;

type Project = typeof schema.project.$inferSelect;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

// The composition and props for a project. Shared by both render paths.
export async function renderInput(p: Project): Promise<{compositionId: string; inputProps: Record<string, unknown>}> {
	if (!p.sourceKey || !p.transcript || !p.plan) throw new Error('Project is not ready to render');
	const src = await mediaUrl(p.sourceKey);
	const sourceDurationMs = (p.durationSec ?? 0) * 1000;
	const variant = getVariant(p.variantId);
	const brollSrc: Record<string, string> = {};
	for (const b of p.plan.broll ?? []) if (b.assetKey && b.source !== 'remotion') brollSrc[b.id] = await mediaUrl(b.assetKey);
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
			palette: p.creative?.palette,
			brollSrc,
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

	if (renderMode === 'local') {
		if (process.env.VERCEL) throw new Error('Rendering is not configured: set REMOTION_LAMBDA_FUNCTION and REMOTION_SERVE_URL.');
		await setProject(projectId, {status: 'rendering', progress: 0.02, error: null});
		await db.insert(schema.job).values({id: randomUUID(), projectId, mode: 'render'});
		return;
	}

	if (storageMode !== 's3') throw new Error('Lambda rendering needs S3 storage (S3_BUCKET).');
	// HyperFrames needs a local Chrome + FFmpeg and Higgsfield polls for minutes, so generated B-roll is made by
	// the local worker only. On Lambda those clips use their Remotion card.
	if (needsGeneration(p.plan).length && p.plan) {
		const plan = {...p.plan, broll: p.plan.broll?.map((b) => (needsGeneration(p.plan).includes(b) ? {...b, error: 'Generated B-roll needs the local render worker; the card was used.'} : b))};
		await setProject(projectId, {plan});
		p.plan = plan;
	}
	const {renderMediaOnLambda} = await import('@remotion/lambda/client');
	const {compositionId, inputProps} = await renderInput(p);
	const {renderId, bucketName} = await renderMediaOnLambda({
		region: lambdaRegion(),
		functionName: process.env.REMOTION_LAMBDA_FUNCTION!,
		serveUrl: process.env.REMOTION_SERVE_URL!,
		composition: compositionId,
		inputProps,
		codec: 'h264',
		crf: 20,
		// the MP4 goes straight into the app's bucket (the Lambda role needs s3:PutObject on it)
		outName: {bucketName: s3Bucket(), key: `projects/${projectId}/output-${randomUUID().slice(0, 8)}.mp4`},
		privacy: 'no-acl',
		downloadBehavior: {type: 'play-in-browser'},
		maxRetries: 2,
	});
	await setProject(projectId, {status: 'rendering', progress: 0.04, error: null, renderId, renderBucket: bucketName});
	await track(projectId).start('render', 'Rendering on Remotion Lambda (AWS)');
}

// Lambda renders run on their own; the status endpoint calls this to advance them.
export async function pollRender(p: Project) {
	if (renderMode !== 'lambda' || p.status !== 'rendering' || !p.renderId || !p.renderBucket) return;
	const {getRenderProgress} = await import('@remotion/lambda/client');
	const pr = await getRenderProgress({renderId: p.renderId, bucketName: p.renderBucket, functionName: process.env.REMOTION_LAMBDA_FUNCTION!, region: lambdaRegion()});
	if (pr.fatalErrorEncountered) {
		console.error('lambda render failed', p.renderId, pr.errors.slice(0, 3));
		await setProject(p.id, {status: 'failed', error: `The render failed: ${pr.errors[0]?.message?.slice(0, 200) ?? 'unknown error'}`, renderId: null, renderBucket: null});
		await track(p.id).fail('render', 'Remotion Lambda reported an error');
	} else if (pr.done && pr.outKey) {
		if (p.outputKey && p.outputKey !== pr.outKey) await removeKey(p.outputKey);
		await setProject(p.id, {status: 'done', progress: 1, outputKey: pr.outKey, renderId: null, renderBucket: null});
		await track(p.id).done('render', 'MP4 ready');
	} else {
		const progress = Math.max(0.04, Math.min(0.99, pr.overallProgress));
		if (Math.floor(progress * 10) > Math.floor(p.progress * 10)) await track(p.id).log('render', `Rendering frames on Lambda: ${Math.round(progress * 100)}%`, progress);
		await setProject(p.id, {progress});
	}
}
