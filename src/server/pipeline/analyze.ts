import {and, eq} from 'drizzle-orm';
import {db, schema} from '@/lib/db';
import type {Provider} from '@/lib/db/schema';
import {decrypt} from '@/server/crypto';
import {startRender} from '@/server/render';
import {readBytes} from '@/server/storage';
import {getVariant} from '@/variants';
import {analyzeCreative, videoMime} from './creative';
import {fakeCreative, fakeKidsPlan, fakePlan, fakeTranscript} from './fake';
import type {BrollMode} from './fx';
import {planEdit} from './plan';
import {planKids} from './plan-kids';
import {ProviderError, transcribeGeminiAudio, transcribeGeminiVideo} from './transcribe';

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

const brollModeOf = (v: unknown): BrollMode => (v === 'none' || v === 'remotion' ? v : 'auto');

// Gemini transcribes and watches the video, Claude plans the edit from Gemini's brief, then the creator reviews.
// Runs in the background after the upload finishes (next/server `after`), so it never blocks a request.
// Each finished step is saved, so a retry or a re-plan only redoes what is missing.
export async function analyzeProject(projectId: string, opts: {notes?: string} = {}) {
	try {
		const [p] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
		if (!p?.sourceKey) throw new ProviderError('The source video is missing.');
		const variant = getVariant(p.variantId);
		const kids = variant?.renderer === 'kids';
		const gemini = FAKE_AI ? null : await userKey(p.userId, 'gemini');
		const anthropic = FAKE_AI ? null : await userKey(p.userId, 'anthropic');
		if (!FAKE_AI && !gemini) throw new ProviderError('Add a Gemini key in API keys.');
		if (!FAKE_AI && !anthropic) throw new ProviderError('Add an Anthropic key in API keys.');
		const higgsfield = FAKE_AI ? false : Boolean(await userKey(p.userId, 'higgsfield'));
		const durationSec = p.durationSec ?? 10;
		const guidance = variant?.plannerGuidance(p.brief) ?? '';

		let transcript = p.transcript;
		let video: Buffer | null = null;
		const source = async () => (video ??= await readBytes(p.sourceKey!));
		if (!transcript) {
			await setProject(p.id, {status: 'transcribing', progress: 0.06, error: null});
			transcript = FAKE_AI
				? fakeTranscript(durationSec)
				: p.audioKey
					? await transcribeGeminiAudio(await readBytes(p.audioKey), gemini!)
					: await transcribeGeminiVideo(await source(), videoMime(p.sourceKey), durationSec, gemini!);
			if (!transcript.length) throw new ProviderError('No speech was found in this video.');
			await setProject(p.id, {transcript, progress: 0.18});
		}

		let creative = p.creative;
		if (!creative) {
			await setProject(p.id, {status: 'analyzing', progress: 0.2});
			creative = FAKE_AI
				? fakeCreative()
				: await analyzeCreative({
						apiKey: gemini!,
						video: await source(),
						mimeType: videoMime(p.sourceKey),
						durationSec,
						words: transcript,
						variantName: variant?.name ?? 'Talking head',
						guidance,
						higgsfield,
						captioned: !kids,
					});
			await setProject(p.id, {creative, progress: 0.28});
		}
		video = null;

		await setProject(p.id, {status: 'planning', progress: 0.3});
		const pacing = String(p.brief.pacing ?? (kids ? 'natural' : 'tight'));
		const brollMode = brollModeOf(p.brief.broll);
		let plan;
		if (FAKE_AI) {
			plan = kids ? fakeKidsPlan(transcript) : fakePlan(transcript, brollMode);
		} else if (kids) {
			plan = await planKids({apiKey: anthropic!, words: transcript, guidance, pacing, notes: opts.notes, previous: p.plan, creative});
		} else {
			plan = await planEdit({
				apiKey: anthropic!,
				words: transcript,
				variantName: variant?.name ?? 'Talking head',
				guidance,
				pacing,
				notes: opts.notes,
				previous: p.plan,
				creative,
				brollMode,
				higgsfield,
			});
		}
		const {captionPreset, ...editPlan} = plan as typeof plan & {captionPreset?: string};
		// the AI's caption pick replaces the form's choice unless the creator turned that off
		const captionStyle = !kids && p.brief.aiStyle !== false && captionPreset && captionPreset !== p.captionStyle.presetId ? {presetId: captionPreset, overrides: {}} : undefined;
		await setProject(p.id, {plan: editPlan, progress: 0.35, ...(captionStyle ? {captionStyle} : {})});

		if (variant?.review === false) await startRender(p.id);
		else await setProject(p.id, {status: 'review', progress: 0.35});
	} catch (e) {
		console.error(`analyze ${projectId} failed`, e);
		await setProject(projectId, {
			status: 'failed',
			error: e instanceof ProviderError ? e.message : 'Something went wrong while planning the edit. Try again.',
		});
	}
}
