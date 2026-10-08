'use server';

import {randomUUID} from 'node:crypto';
import {and, eq} from 'drizzle-orm';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requireUser} from '@/lib/auth';
import {encrypt} from '@/server/crypto';
import {db, schema} from '@/lib/db';
import {PROVIDERS} from '@/lib/db/schema';

const Input = z.object({
	provider: z.enum(PROVIDERS),
	key: z.string().trim().min(16, 'That key looks too short.').max(400),
});

export type KeyFormState = {ok?: string; error?: string} | null;

export async function saveKey(_prev: KeyFormState, form: FormData): Promise<KeyFormState> {
	const user = await requireUser();
	const parsed = Input.safeParse({provider: form.get('provider'), key: form.get('key')});
	if (!parsed.success) return {error: parsed.error.issues[0]?.message ?? 'Invalid key.'};
	const {provider, key} = parsed.data;
	if (provider === 'anthropic' && !key.startsWith('sk-ant-')) return {error: 'Anthropic keys start with sk-ant-.'};
	if (provider === 'higgsfield' && !/^[^:\s]+:[^:\s]+$/.test(key)) return {error: 'Paste the Higgsfield key as KEY_ID:KEY_SECRET.'};

	const values = {ciphertext: encrypt(key), last4: key.slice(-4)};
	await db
		.insert(schema.apiKey)
		.values({id: randomUUID(), userId: user.id, provider, ...values})
		.onConflictDoUpdate({target: [schema.apiKey.userId, schema.apiKey.provider], set: {...values, updatedAt: new Date()}});
	revalidatePath('/settings/keys');
	return {ok: 'Saved.'};
}

export async function deleteKey(form: FormData) {
	const user = await requireUser();
	const provider = z.enum(PROVIDERS).parse(form.get('provider'));
	await db.delete(schema.apiKey).where(and(eq(schema.apiKey.userId, user.id), eq(schema.apiKey.provider, provider)));
	revalidatePath('/settings/keys');
}
