import {randomUUID} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {and, eq} from 'drizzle-orm';
import {db, schema} from '@/lib/db';
import type {Provider} from '@/lib/db/schema';
import type {BrollCue, EditPlan} from '@/remotion/types';
import {decrypt} from '@/server/crypto';
import {ProviderError} from '@/server/pipeline/errors';
import {putFile} from '@/server/storage';
import {aspectFor, generateClip} from './higgsfield';
import {renderAnimation, writeAnimation} from './hyperframes';

// Runs after the storyboard is approved, before the render: makes every HyperFrames / Higgsfield clip the
// storyboard asked for. A clip that fails keeps its Remotion card, and the reason is shown on the storyboard.

type Project = typeof schema.project.$inferSelect;

async function key(userId: string, provider: Provider) {
	const [row] = await db
		.select({c: schema.apiKey.ciphertext})
		.from(schema.apiKey)
		.where(and(eq(schema.apiKey.userId, userId), eq(schema.apiKey.provider, provider)));
	return row ? decrypt(row.c) : null;
}

// A clip that failed is not retried on its own (it may cost credits); switching its source on the storyboard clears the error.
export const needsGeneration = (plan: EditPlan | null | undefined) => (plan?.broll ?? []).filter((b) => b.source !== 'remotion' && !b.assetKey && !b.error);

// Output size for generated clips: the video's aspect, at most 1080 px on the short side.
function clipSize(p: Project) {
	const w = p.width ?? 1080;
	const h = p.height ?? 1920;
	const k = Math.min(1, 1080 / Math.min(w, h));
	const even = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
	return {width: even(w), height: even(h)};
}

async function download(url: string, file: string) {
	const res = await fetch(url);
	if (!res.ok || !res.body) throw new ProviderError(`Could not download the Higgsfield clip (${res.status}).`);
	await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), createWriteStream(file));
}

async function makeClip(p: Project, cue: BrollCue, seconds: number, dir: string): Promise<string> {
	if (cue.source === 'hyperframes') {
		const apiKey = await key(p.userId, 'anthropic');
		if (!apiKey) throw new ProviderError('Add an Anthropic key in API keys.');
		const size = clipSize(p);
		const animation = await writeAnimation({apiKey, cue, seconds, ...size, creative: p.creative ?? null});
		return renderAnimation(animation, {dir, seconds, ...size, palette: p.creative?.palette ?? ['#111111', '#FFFFFF', '#FFD43B']});
	}
	const apiKey = await key(p.userId, 'higgsfield');
	if (!apiKey) throw new ProviderError('Add a Higgsfield key in API keys.');
	const url = await generateClip({apiKey, prompt: cue.prompt ?? cue.card.title, seconds, aspect: aspectFor(p.width ?? 1080, p.height ?? 1920)});
	const file = path.join(dir, 'higgsfield.mp4');
	await download(url, file);
	return file;
}

export async function generateBroll(projectId: string, onProgress: (done: number, total: number) => void = () => undefined) {
	const [p] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
	if (!p?.plan || !p.transcript) return;
	const todo = needsGeneration(p.plan);
	if (!todo.length) return;
	const words = p.transcript;
	const plan: EditPlan = {...p.plan, broll: [...(p.plan.broll ?? [])]};
	const save = () => db.update(schema.project).set({plan}).where(eq(schema.project.id, projectId));
	onProgress(0, todo.length);
	for (const [n, cue] of todo.entries()) {
		const seconds = Math.max(1.5, (words[cue.untilWord].endMs - words[cue.atWord].startMs) / 1000 + 0.3);
		const dir = path.join(os.tmpdir(), 'cutline-broll', `${projectId}-${cue.id}-${Date.now()}`);
		await mkdir(dir, {recursive: true});
		let patch: Partial<BrollCue>;
		try {
			const file = await makeClip(p, cue, seconds, dir);
			const assetKey = `projects/${projectId}/broll/${cue.id}-${randomUUID().slice(0, 8)}.mp4`;
			await putFile(assetKey, file, 'video/mp4');
			patch = {assetKey, error: undefined};
		} catch (e) {
			console.error(`b-roll ${cue.id} (${cue.source}) for ${projectId} failed`, e);
			patch = {error: e instanceof ProviderError ? e.message : `${cue.source === 'hyperframes' ? 'HyperFrames' : 'Higgsfield'} could not make this clip.`};
		} finally {
			await rm(dir, {recursive: true, force: true});
		}
		plan.broll = plan.broll!.map((b) => (b.id === cue.id ? {...b, ...patch} : b));
		await save();
		onProgress(n + 1, todo.length);
	}
}
