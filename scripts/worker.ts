// Local render worker (development, or self-hosting without Remotion Lambda). Works with local disk or S3.
// Transcription and planning run inside the web app; this process only renders queued jobs.
// Run alongside the web app:  npm run worker
import {randomUUID} from 'node:crypto';
import {mkdir, rm, stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {and, asc, eq, lt} from 'drizzle-orm';
import {db, schema} from '@/lib/db';
import {track} from '@/server/activity';
import {generateBroll, needsGeneration} from '@/server/broll';
import {getServeUrl, renderComposition} from '@/server/pipeline/render';
import {renderInput} from '@/server/render';
import {putFile, removeKey} from '@/server/storage';

const POLL_MS = 2000;
const STALE_MS = 45 * 60 * 1000;
const MAX_ATTEMPTS = 2;

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

async function setProject(id: string, patch: Partial<typeof schema.project.$inferInsert>) {
	await db.update(schema.project).set(patch).where(eq(schema.project.id, id));
}

// Throttled progress writes (at most every 1.5s or 5%).
function progressWriter(projectId: string) {
	let last = 0;
	let lastP = -1;
	return (p: number) => {
		const v = 0.05 + 0.94 * p;
		if (Date.now() - last < 1500 && v - lastP < 0.05) return;
		last = Date.now();
		lastP = v;
		void setProject(projectId, {progress: v});
	};
}

async function claim() {
	// requeue jobs whose worker died
	await db
		.update(schema.job)
		.set({status: 'queued', lockedAt: null})
		.where(and(eq(schema.job.status, 'running'), lt(schema.job.lockedAt, new Date(Date.now() - STALE_MS))));
	const [next] = await db.select().from(schema.job).where(eq(schema.job.status, 'queued')).orderBy(asc(schema.job.createdAt)).limit(1);
	if (!next) return null;
	const res = await db
		.update(schema.job)
		.set({status: 'running', lockedAt: new Date(), attempts: next.attempts + 1})
		.where(and(eq(schema.job.id, next.id), eq(schema.job.status, 'queued')))
		.returning();
	return res[0] ?? null; // another worker may have taken it
}

async function runJob(job: typeof schema.job.$inferSelect) {
	const t = track(job.projectId);
	const [before] = await db.select({plan: schema.project.plan}).from(schema.project).where(eq(schema.project.id, job.projectId));
	// the storyboard was approved: first make the HyperFrames / Higgsfield clips it asked for
	const todo = needsGeneration(before?.plan).length;
	if (todo) {
		await t.start('broll', `Making ${todo} B-roll clip${todo > 1 ? 's' : ''}`);
		await generateBroll(
			job.projectId,
			(done, total) => void setProject(job.projectId, {status: 'generating', progress: 0.02 + 0.3 * (done / total)}),
			(msg) => void t.log('broll', msg),
		);
		const [after] = await db.select({plan: schema.project.plan}).from(schema.project).where(eq(schema.project.id, job.projectId));
		const failed = (after?.plan?.broll ?? []).filter((b) => b.error && b.source !== 'remotion').length;
		await t.done('broll', failed ? `${todo - failed} made, ${failed} fell back to cards` : `${todo} clip${todo > 1 ? 's' : ''} made`);
	} else if (before?.plan?.broll?.length) {
		await t.done('broll', 'Built-in cards only, nothing to generate');
	}
	const [p] = await db.select().from(schema.project).where(eq(schema.project.id, job.projectId));
	if (!p) return;
	await setProject(p.id, {status: 'rendering', progress: 0.04});
	const {compositionId, inputProps} = await renderInput(p);
	await t.start('render', `Rendering ${compositionId} on this computer`);
	const outKey = `projects/${p.id}/output-${randomUUID().slice(0, 8)}.mp4`;
	const tmpDir = path.join(os.tmpdir(), 'cutline-render');
	await mkdir(tmpDir, {recursive: true});
	const tmp = path.join(tmpDir, `${p.id}-${Date.now()}.mp4`);
	const started = Date.now();
	let lastPct = -1;
	const writeProgress = progressWriter(p.id);
	try {
		await renderComposition({
			compositionId,
			inputProps,
			outputPath: tmp,
			onProgress: (pr) => {
				writeProgress(pr);
				const pct = Math.floor(pr * 100);
				if (pct >= lastPct + 10) {
					lastPct = pct;
					void t.log('render', `Rendering frames: ${pct}%`, pr);
				}
			},
		});
		await t.log('render', 'Saving the MP4');
		await putFile(outKey, tmp, 'video/mp4');
		const size = (await stat(tmp)).size;
		await t.done('render', `MP4 ready (${(size / 1e6).toFixed(1)} MB) in ${Math.round((Date.now() - started) / 1000)} s`);
	} finally {
		await rm(tmp, {force: true});
	}
	if (p.outputKey) await removeKey(p.outputKey);
	await setProject(p.id, {status: 'done', progress: 1, outputKey: outKey, error: null});
}

async function loop() {
	log('render worker started; bundling Remotion project…');
	await getServeUrl();
	log('ready, waiting for jobs');
	for (;;) {
		const job = await claim().catch((e) => {
			log('claim failed', e);
			return null;
		});
		if (!job) {
			await new Promise((r) => setTimeout(r, POLL_MS));
			continue;
		}
		log(`job ${job.id} for project ${job.projectId}, attempt ${job.attempts}`);
		try {
			await runJob(job);
			await db.update(schema.job).set({status: 'done'}).where(eq(schema.job.id, job.id));
			log(`job ${job.id} done`);
		} catch (e) {
			log(`job ${job.id} failed:`, e);
			const retry = job.attempts < MAX_ATTEMPTS;
			await db
				.update(schema.job)
				.set({status: retry ? 'queued' : 'failed', error: String(e instanceof Error ? (e.stack ?? e.message) : e).slice(0, 2000)})
				.where(eq(schema.job.id, job.id));
			if (retry) await track(job.projectId).log('render', 'The render failed; trying once more');
			else {
				await track(job.projectId).failRunning('The render failed. Try again.');
				await setProject(job.projectId, {status: 'failed', error: 'The render failed. Try again.'});
			}
		}
	}
}

void loop();
