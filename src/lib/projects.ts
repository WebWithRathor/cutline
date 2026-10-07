import 'server-only';
import {randomUUID} from 'node:crypto';
import {and, eq} from 'drizzle-orm';
import {db, schema} from './db';

export async function getOwnedProject(userId: string, id: string) {
	const [p] = await db
		.select()
		.from(schema.project)
		.where(and(eq(schema.project.id, id), eq(schema.project.userId, userId)));
	return p ?? null;
}

export async function enqueue(projectId: string, mode: 'full' | 'render') {
	await db.insert(schema.job).values({id: randomUUID(), projectId, mode});
	await db
		.update(schema.project)
		.set({status: 'queued', progress: 0, error: null})
		.where(eq(schema.project.id, projectId));
}

export const STATUS_LABEL: Record<string, string> = {
	draft: 'Waiting for upload',
	queued: 'Queued',
	transcribing: 'Transcribing',
	planning: 'Planning the edit',
	rendering: 'Rendering',
	done: 'Ready',
	failed: 'Failed',
};
