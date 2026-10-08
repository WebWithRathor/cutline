import 'server-only';
import {and, eq} from 'drizzle-orm';
import {db, schema} from './db';
import {decrypt} from '@/server/crypto';
import type {Provider} from './db/schema';

export const PROVIDER_INFO: Record<Provider, {name: string; use: string; placeholder: string; docs: string; optional?: boolean}> = {
	gemini: {
		name: 'Google Gemini',
		use: 'Transcribes your recording word by word, then watches the video and writes the creative brief: theme, mood, captions, grade, VFX, sound effects and B-roll ideas.',
		placeholder: 'AIza…',
		docs: 'https://aistudio.google.com/app/apikey',
	},
	anthropic: {
		name: 'Anthropic (Claude)',
		use: 'Edits from the brief: cuts, keywords, captions, and where every effect, sound and B-roll clip lands. Also writes HyperFrames animations.',
		placeholder: 'sk-ant-…',
		docs: 'https://console.anthropic.com/settings/keys',
	},
	higgsfield: {
		name: 'Higgsfield (optional)',
		use: 'AI-generated B-roll footage. Uses your Higgsfield credits, only for clips you approve. Paste it as KEY_ID:KEY_SECRET.',
		placeholder: 'key-id:key-secret',
		docs: 'https://cloud.higgsfield.ai/api-keys',
		optional: true,
	},
};

export async function listKeys(userId: string) {
	const rows = await db
		.select({provider: schema.apiKey.provider, last4: schema.apiKey.last4, updatedAt: schema.apiKey.updatedAt})
		.from(schema.apiKey)
		.where(eq(schema.apiKey.userId, userId));
	return rows;
}

// Decrypts a user's key. Server-side only, used by the render worker.
export async function getKey(userId: string, provider: Provider): Promise<string | null> {
	const [row] = await db
		.select({ciphertext: schema.apiKey.ciphertext})
		.from(schema.apiKey)
		.where(and(eq(schema.apiKey.userId, userId), eq(schema.apiKey.provider, provider)));
	return row ? decrypt(row.ciphertext) : null;
}
