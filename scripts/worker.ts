// Render worker: picks queued jobs from the database and runs transcribe -> plan -> render.
// Run alongside the web app:  npm run worker
import {randomUUID} from 'node:crypto';
import {mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {and, asc, eq, lt} from 'drizzle-orm';
import {db, schema} from '@/lib/db';
import {decrypt} from '@/server/crypto';
import {fakePlan, fakeTranscript} from '@/server/pipeline/fake';
import {extractAudio, probe} from '@/server/pipeline/media';
import {planEdit} from '@/server/pipeline/plan';
import {getServeUrl, renderCaptioned} from '@/server/pipeline/render';
import {ProviderError, transcribeDeepgram, transcribeOpenAI} from '@/server/pipeline/transcribe';
import {signedFileUrl, storage} from '@/server/storage';
import type {Provider} from '@/lib/db/schema';
import {getVariant} from '@/variants';

const POLL_MS = 2000;
const STALE_MS = 45 * 60 * 1000;
const MAX_ATTEMPTS = 2;

const FAKE_AI = process.env.CUTLINE_FAKE_AI === '1' && process.env.NODE_ENV !== 'production';

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

async function userKey(userId: string, provider: Provider) {
	const [row] = await db
		.select({c: schema.apiKey.ciphertext})
		.from(schema.apiKey)
		.where(and(eq(schema.apiKey.userId, userId), eq(schema.apiKey.provider, provider)));
	return row ? decrypt(row.c) : null;
}

async function setProject(id: string, patch: Partial<typeof schema.project.$inferInsert>) {
	await db.update(schema.project).set(patch).where(eq(schema.project.id, id));
}

// Throttled progress writes (at most every 1.5s or 5%).
function progressWriter(projectId: string, from: number, to: number) {
	let last = 0;
	let lastP = -1;
	return (p: number) => {
		const v = from + (to - from) * p;
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
	const [p] = await db.select().from(schema.project).where(eq(schema.project.id, job.projectId));
	if (!p?.sourceKey) throw new ProviderError('The source video is missing.');
	const sourcePath = storage.path(p.sourceKey);
	const workDir = storage.path(`projects/${p.id}/work`);
	await mkdir(workDir, {recursive: true});

	let {transcript, plan, durationSec, width, height} = p;

	if (job.mode === 'full' || !transcript || !plan) {
		// 1. probe + transcribe
		await setProject(p.id, {status: 'transcribing', progress: 0.03});
		const info = await probe(sourcePath);
		durationSec = info.durationSec;
		width = info.width;
		height = info.height;
		if (!info.hasAudio) throw new ProviderError('This video has no audio track, so there is nothing to caption.');
		await setProject(p.id, {durationSec, width, height, progress: 0.06});
		const audio = path.join(workDir, 'audio.mp3');
		await extractAudio(sourcePath, audio);
		await setProject(p.id, {progress: 0.1});
		if (FAKE_AI) {
			transcript = fakeTranscript(durationSec);
		} else {
			const dg = await userKey(p.userId, 'deepgram');
			const oa = dg ? null : await userKey(p.userId, 'openai');
			if (!dg && !oa) throw new ProviderError('Add a transcription key (OpenAI or Deepgram) in API keys.');
			transcript = dg ? await transcribeDeepgram(audio, dg) : await transcribeOpenAI(audio, oa!);
		}
		if (!transcript.length) throw new ProviderError('No speech was found in this video.');
		await setProject(p.id, {transcript, progress: 0.25});

		// 2. plan
		await setProject(p.id, {status: 'planning', progress: 0.27});
		const anthropic = FAKE_AI ? null : await userKey(p.userId, 'anthropic');
		if (!anthropic && !FAKE_AI) throw new ProviderError('Add an Anthropic key in API keys.');
		const variant = getVariant(p.variantId);
		plan = FAKE_AI ? fakePlan(transcript) : await planEdit({
			apiKey: anthropic!,
			words: transcript,
			variantName: variant?.name ?? 'Talking head',
			guidance: variant?.plannerGuidance(p.brief) ?? '',
			pacing: String(p.brief.pacing ?? 'tight'),
		});
		await setProject(p.id, {plan, progress: 0.35});
	}

	// 3. render
	await setProject(p.id, {status: 'rendering', progress: 0.36});
	const outKey = `projects/${p.id}/output-${randomUUID().slice(0, 8)}.mp4`;
	await mkdir(path.dirname(storage.path(outKey)), {recursive: true});
	await renderCaptioned({
		props: {
			src: signedFileUrl(p.sourceKey),
			sourceDurationMs: (durationSec ?? 0) * 1000,
			words: transcript,
			plan,
			style: p.captionStyle,
			hookText: p.brief.hook === false ? undefined : plan.hook,
		},
		width: width ?? 1080,
		height: height ?? 1920,
		outputPath: storage.path(outKey),
		onProgress: progressWriter(p.id, 0.36, 0.99),
	});

	if (p.outputKey) await rm(storage.path(p.outputKey), {force: true});
	await setProject(p.id, {status: 'done', progress: 1, outputKey: outKey, error: null});
	await rm(workDir, {recursive: true, force: true});
}

async function loop() {
	log(`worker started${FAKE_AI ? ' (FAKE AI mode: no provider calls)' : ''}; bundling Remotion project…`);
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
		log(`job ${job.id} (${job.mode}) for project ${job.projectId}, attempt ${job.attempts}`);
		try {
			await runJob(job);
			await db.update(schema.job).set({status: 'done'}).where(eq(schema.job.id, job.id));
			log(`job ${job.id} done`);
		} catch (e) {
			const userFacing = e instanceof ProviderError;
			const message = userFacing ? e.message : 'Something went wrong while editing. Try again.';
			log(`job ${job.id} failed:`, e);
			const retry = !userFacing && job.attempts < MAX_ATTEMPTS;
			await db
				.update(schema.job)
				.set({status: retry ? 'queued' : 'failed', error: String(e instanceof Error ? e.stack ?? e.message : e).slice(0, 2000)})
				.where(eq(schema.job.id, job.id));
			if (!retry) await setProject(job.projectId, {status: 'failed', error: message});
		}
	}
}

void loop();
