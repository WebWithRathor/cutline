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
	transcribing: 'Gemini is transcribing',
	analyzing: 'Gemini is watching your video',
	planning: 'Claude is planning the edit',
	review: 'Storyboard ready for your approval',
	generating: 'Generating B-roll',
	rendering: 'Rendering',
	done: 'Ready',
	failed: 'Failed',
};
