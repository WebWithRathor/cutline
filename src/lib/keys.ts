import 'server-only';
import {and, eq} from 'drizzle-orm';
import {db, schema} from './db';
import {decrypt} from '@/server/crypto';
import type {Provider} from './db/schema';

export const PROVIDER_INFO: Record<Provider, {name: string; use: string; placeholder: string; docs: string}> = {
	anthropic: {
		name: 'Anthropic (Claude)',
		use: 'Plans the edit: what to cut, which words to highlight, where to zoom.',
		placeholder: 'sk-ant-…',
		docs: 'https://console.anthropic.com/settings/keys',
	},
	openai: {
		name: 'OpenAI',
		use: 'Transcribes speech with word-level timestamps (Whisper).',
		placeholder: 'sk-…',
		docs: 'https://platform.openai.com/api-keys',
	},
	deepgram: {
		name: 'Deepgram',
		use: 'Alternative transcription with word-level timestamps.',
		placeholder: 'Deepgram API key',
		docs: 'https://console.deepgram.com/',
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
