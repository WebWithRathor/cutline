'use server';

import {randomUUID} from 'node:crypto';
import {and, eq} from 'drizzle-orm';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {after} from 'next/server';
import {z} from 'zod';
import {requireUser} from '@/lib/auth';
import {db, schema} from '@/lib/db';
import {listKeys} from '@/lib/keys';
import {getOwnedProject} from '@/lib/projects';
import {analyzeProject} from '@/server/pipeline/analyze';
import {startRender} from '@/server/render';
import {removePrefix} from '@/server/storage';
import {PRESET_META as PRESETS} from '@/remotion/captions/meta';
import {getVariant} from '@/variants';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const StyleSchema = z.object({
	presetId: z.string().refine((id) => PRESETS.some((p) => p.id === id), 'Unknown caption style.'),
	overrides: z
		.object({
			primaryColor: hex.optional(),
			accentColor: hex.optional(),
			fontFamily: z.string().max(60).optional(),
			sizeScale: z.number().min(0.5).max(1.8).optional(),
			positionY: z.number().min(0.05).max(0.95).optional(),
			pageMs: z.number().min(300).max(3000).optional(),
		})
		.strict(),
});

const CreateSchema = z.object({
	title: z.string().trim().min(1, 'Give the video a title.').max(120),
	variantId: z.string(),
	brief: z.record(z.string(), z.union([z.string().max(2000), z.boolean()])),
	style: StyleSchema,
});

export type CreateResult = {id?: string; error?: string};

// Creates the project row; the client then uploads the file, which queues the edit.
export async function createProject(input: z.input<typeof CreateSchema>): Promise<CreateResult> {
	const user = await requireUser();
	const parsed = CreateSchema.safeParse(input);
	if (!parsed.success) return {error: parsed.error.issues[0]?.message ?? 'Check the form.'};
	const variant = getVariant(parsed.data.variantId);
	if (!variant) return {error: 'Pick a video type.'};
	for (const f of variant.fields) {
		if ('required' in f && f.required && !String(parsed.data.brief[f.name] ?? '').trim()) return {error: `${f.label} is required.`};
	}
	const keys = new Set((await listKeys(user.id)).map((k) => k.provider));
	if (!keys.has('anthropic') || !(keys.has('openai') || keys.has('deepgram'))) {
		return {error: 'Add an Anthropic key and a transcription key (OpenAI or Deepgram) in API keys first.'};
	}
	const id = randomUUID();
	await db.insert(schema.project).values({
		id,
		userId: user.id,
		title: parsed.data.title,
		variantId: variant.id,
		brief: parsed.data.brief,
		captionStyle: parsed.data.style,
	});
	return {id};
}

// Changes the caption style of a finished project and renders again (no new transcription or planning).
export async function restyleProject(id: string, style: z.input<typeof StyleSchema>): Promise<{error?: string}> {
	const user = await requireUser();
	const parsed = StyleSchema.safeParse(style);
	if (!parsed.success) return {error: parsed.error.issues[0]?.message};
	const p = await getOwnedProject(user.id, id);
	if (!p) return {error: 'Project not found.'};
	if (!p.transcript || !p.plan) return {error: 'Wait for the first edit to finish.'};
	if (!['done', 'failed'].includes(p.status)) return {error: 'This video is still being edited.'};
	await db.update(schema.project).set({captionStyle: parsed.data}).where(eq(schema.project.id, id));
	return startOrFail(id);
}

async function startOrFail(id: string): Promise<{error?: string}> {
	try {
		await startRender(id);
	} catch (e) {
		console.error('start render', e);
		await db.update(schema.project).set({status: 'failed', error: 'The render could not start. Try again.'}).where(eq(schema.project.id, id));
		return {error: 'The render could not start. Try again.'};
	} finally {
		revalidatePath(`/projects/${id}`);
	}
	return {};
}

// Kit Student: the creator approved the takes and beat plan.
export async function approvePlan(id: string): Promise<{error?: string}> {
	const user = await requireUser();
	const p = await getOwnedProject(user.id, id);
	if (!p) return {error: 'Project not found.'};
	if (p.status !== 'review' || !p.plan) return {error: 'There is no plan waiting for approval.'};
	return startOrFail(id);
}

// Plan again, taking the creator's notes into account. Keeps the transcript.
export async function replanProject(id: string, notes: string): Promise<{error?: string}> {
	const user = await requireUser();
	const p = await getOwnedProject(user.id, id);
	if (!p) return {error: 'Project not found.'};
	if (!['review', 'done', 'failed'].includes(p.status) || !p.transcript) return {error: 'Wait for the transcript first.'};
	const clean = notes.trim().slice(0, 2000);
	if (!clean) return {error: 'Write what you want changed.'};
	await db.update(schema.project).set({status: 'planning', progress: 0.28, error: null}).where(eq(schema.project.id, id));
	after(() => analyzeProject(id, {notes: clean}));
	revalidatePath(`/projects/${id}`);
	return {};
}

export async function retryProject(id: string) {
	const user = await requireUser();
	const p = await getOwnedProject(user.id, id);
	if (!p?.sourceKey || p.status !== 'failed') return;
	if (p.transcript && p.plan) {
		await startOrFail(id);
		return;
	}
	await db.update(schema.project).set({status: 'queued', progress: 0.02, error: null}).where(eq(schema.project.id, id));
	after(() => analyzeProject(id));
	revalidatePath(`/projects/${id}`);
}

export async function deleteProject(form: FormData) {
	const user = await requireUser();
	const id = String(form.get('id'));
	const p = await getOwnedProject(user.id, id);
	if (!p) return;
	await db.delete(schema.project).where(and(eq(schema.project.id, id), eq(schema.project.userId, user.id)));
	await removePrefix(`projects/${id}`).catch((e) => console.error('delete files', e));
	revalidatePath('/dashboard');
	redirect('/dashboard');
}
