import {and, eq} from 'drizzle-orm';
import {db, schema} from '@/lib/db';
import type {Provider} from '@/lib/db/schema';
import {decrypt} from '@/server/crypto';
import {startRender} from '@/server/render';
import {mediaUrl, readBytes} from '@/server/storage';
import {getVariant} from '@/variants';
import {fakeKidsPlan, fakePlan, fakeTranscript} from './fake';
import {planEdit} from './plan';
import {planKids} from './plan-kids';
import {ProviderError, transcribeDeepgram, transcribeOpenAI} from './transcribe';

// dev-only stand-ins for the AI providers; never active on Vercel
const FAKE_AI = process.env.CUTLINE_FAKE_AI === '1' && !process.env.VERCEL;

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

// Transcribe (if needed) and plan the edit, then either wait for approval or start the render.
// Runs in the background after the upload finishes (next/server `after`), so it never blocks a request.
export async function analyzeProject(projectId: string, opts: {notes?: string} = {}) {
	try {
		const [p] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
		if (!p?.sourceKey) throw new ProviderError('The source video is missing.');
		const variant = getVariant(p.variantId);
		let transcript = p.transcript;

		if (!transcript) {
			await setProject(p.id, {status: 'transcribing', progress: 0.08, error: null});
			if (FAKE_AI) {
				transcript = fakeTranscript(p.durationSec ?? 10);
			} else {
				const dg = await userKey(p.userId, 'deepgram');
				const oa = dg ? null : await userKey(p.userId, 'openai');
				if (!dg && !oa) throw new ProviderError('Add a transcription key (OpenAI or Deepgram) in API keys.');
				if (p.audioKey) {
					const audio = await readBytes(p.audioKey);
					transcript = dg ? await transcribeDeepgram({audio}, dg) : await transcribeOpenAI(audio, oa!);
				} else if (dg) {
					// the browser couldn't extract audio; Deepgram can read the video itself
					transcript = await transcribeDeepgram({url: await mediaUrl(p.sourceKey, 60 * 30)}, dg);
				} else {
					throw new ProviderError('Your browser couldn’t extract the audio from this file. Add a Deepgram key (it reads video directly) or upload an MP4.');
				}
			}
			if (!transcript.length) throw new ProviderError('No speech was found in this video.');
			await setProject(p.id, {transcript, progress: 0.25});
		}

		await setProject(p.id, {status: 'planning', progress: 0.28});
		let plan;
		if (FAKE_AI) {
			plan = variant?.renderer === 'kids' ? fakeKidsPlan(transcript) : fakePlan(transcript);
		} else {
			const apiKey = await userKey(p.userId, 'anthropic');
			if (!apiKey) throw new ProviderError('Add an Anthropic key in API keys.');
			const guidance = variant?.plannerGuidance(p.brief) ?? '';
			const pacing = String(p.brief.pacing ?? 'tight');
			plan =
				variant?.renderer === 'kids'
					? await planKids({apiKey, words: transcript, guidance, pacing, notes: opts.notes, previous: p.plan})
					: await planEdit({apiKey, words: transcript, variantName: variant?.name ?? 'Talking head', guidance, pacing, notes: opts.notes});
		}
		await setProject(p.id, {plan, progress: 0.35});

		if (variant?.review) await setProject(p.id, {status: 'review', progress: 0.35});
		else await startRender(p.id);
	} catch (e) {
		console.error(`analyze ${projectId} failed`, e);
		await setProject(projectId, {
			status: 'failed',
			error: e instanceof ProviderError ? e.message : 'Something went wrong while planning the edit. Try again.',
		});
	}
}
