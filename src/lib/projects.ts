import 'server-only';
import {and, eq} from 'drizzle-orm';
import {db, schema} from './db';

export async function getOwnedProject(userId: string, id: string) {
	const [p] = await db
		.select()
		.from(schema.project)
		.where(and(eq(schema.project.id, id), eq(schema.project.userId, userId)));
	return p ?? null;
}

export const STATUS_LABEL: Record<string, string> = {
	draft: 'Waiting for upload',
	queued: 'Queued',
	transcribing: 'Transcribing',
	planning: 'Planning the edit',
	review: 'Waiting for your approval',
	rendering: 'Rendering',
	done: 'Ready',
	failed: 'Failed',
};
