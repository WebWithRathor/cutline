import {writeFile, mkdir, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {and, eq} from 'drizzle-orm';
import {db, schema} from '@/lib/db';
import type {Provider} from '@/lib/db/schema';
import {PRESET_META} from '@/remotion/captions/meta';
import {BROLL_MODE_META, brollModeOf, getGrade} from '@/remotion/fx/meta';
import type {EditPlan, Word} from '@/remotion/types';
import {track, type Tracker} from '@/server/activity';
import {decrypt} from '@/server/crypto';
import {startRender} from '@/server/render';
import {localPath, mediaUrl, readBytes, storageMode} from '@/server/storage';
import {getVariant} from '@/variants';
import {analyzeCreative, videoMime} from './creative';
import {fakeCreative, fakeKidsPlan, fakePlan, fakeTranscript} from './fake';
import {MODEL as CLAUDE_MODEL, planEdit} from './plan';
import {planKids} from './plan-kids';
import {ProviderError, transcribeWhisper} from './transcribe';

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

type Project = typeof schema.project.$inferSelect;

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const fmtLen = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

// Whisper on this computer. Uses the browser's 16 kHz WAV when there is one, otherwise FFmpeg reads the video.
async function transcribe(p: Project, t: Tracker): Promise<Word[]> {
	const report = (msg: string, fraction?: number) => {
		void t.log('transcribe', msg, fraction);
		if (fraction !== undefined) void setProject(p.id, {progress: 0.04 + 0.14 * fraction});
	};
	const tmp = path.join(os.tmpdir(), 'cutline-audio', p.id);
	try {
		let input: string;
		let isWav = false;
		if (p.audioKey) {
			isWav = true;
			if (storageMode === 'local') input = localPath(p.audioKey);
			else {
				await mkdir(tmp, {recursive: true});
				input = path.join(tmp, 'audio.wav');
				await writeFile(input, await readBytes(p.audioKey));
			}
			report('Using the 16 kHz audio extracted in your browser');
		} else {
			input = storageMode === 'local' ? localPath(p.sourceKey!) : await mediaUrl(p.sourceKey!, 60 * 30);
			report('No browser audio: FFmpeg will read it from the video');
		}
		const started = Date.now();
		const r = await transcribeWhisper({input, isWav, durationSec: p.durationSec ?? 60, report});
		void t.log('transcribe', `Whisper ${r.model} finished in ${secs(Date.now() - started)}, language: ${r.language}`);
		return r.words;
	} finally {
		await rm(tmp, {recursive: true, force: true});
	}
}

function planSummary(plan: EditPlan, words: Word[]) {
	const cut = (plan.removed ?? []).reduce((a, r) => a + r.to - r.from + 1, 0);
	const parts = [`cut ${cut} of ${words.length} words`, `${plan.keywords.length} keywords`];
	if (plan.broll) parts.push(`${plan.broll.length} B-roll`);
	if (plan.vfx) parts.push(`${plan.vfx.length} effects`);
	if (plan.sfx) parts.push(`${plan.sfx.length} sounds`);
	if (plan.shots) parts.push(`${plan.shots.length} shots`);
	if (plan.grade) parts.push(`${getGrade(plan.grade).name} grade`);
	return parts.join(' · ');
}

// Whisper transcribes, Gemini watches the video and writes the creative brief, Claude plans the edit, then the
// creator reviews the storyboard. Runs in the background after the upload (next/server `after`).
// Each finished step is saved, so a retry or a re-plan only redoes what is missing. Every step reports what it is
// doing to the live activity log (project.activity) and the terminal.
export async function analyzeProject(projectId: string, opts: {notes?: string} = {}) {
	const t = track(projectId);
	try {
		const [p] = await db.select().from(schema.project).where(eq(schema.project.id, projectId));
		if (!p?.sourceKey) throw new ProviderError('The source video is missing.');
		const variant = getVariant(p.variantId);
		const kids = variant?.renderer === 'kids';
		const brollMode = kids ? 'none' : brollModeOf(p.brief.broll);
		if (!p.activity?.steps?.length) await t.reset({broll: brollMode !== 'none'});
		const gemini = FAKE_AI ? null : await userKey(p.userId, 'gemini');
		const anthropic = FAKE_AI ? null : await userKey(p.userId, 'anthropic');
		if (!FAKE_AI && !gemini) throw new ProviderError('Add a Gemini key in API keys.');
		if (!FAKE_AI && !anthropic) throw new ProviderError('Add an Anthropic key in API keys.');
		const durationSec = p.durationSec ?? 10;
		const guidance = variant?.plannerGuidance(p.brief) ?? '';

		// 1. Whisper
		let transcript = p.transcript;
		if (!transcript) {
			await setProject(p.id, {status: 'transcribing', progress: 0.04, error: null});
			await t.start('transcribe', `Transcribing ${fmtLen(durationSec)} of speech`, FAKE_AI ? 'Test data (CUTLINE_FAKE_AI)' : undefined);
			transcript = FAKE_AI ? fakeTranscript(durationSec) : await transcribe(p, t);
			if (!transcript.length) throw new ProviderError('No speech was found in this video.');
			await setProject(p.id, {transcript, progress: 0.18});
			await t.done('transcribe', `${transcript.length} words with timings`);
		}

		// 2. Gemini
		let creative = p.creative;
		if (!creative) {
			await setProject(p.id, {status: 'analyzing', progress: 0.2});
			await t.start('analyze', 'Getting the video ready for Gemini', FAKE_AI ? 'Test data (CUTLINE_FAKE_AI)' : undefined);
			creative = FAKE_AI
				? fakeCreative()
				: await analyzeCreative({
						apiKey: gemini!,
						video: await readBytes(p.sourceKey),
						mimeType: videoMime(p.sourceKey),
						durationSec,
						words: transcript,
						variantName: variant?.name ?? 'Talking head',
						guidance,
						brollMode,
						captioned: !kids,
						report: (msg) => void t.log('analyze', msg),
					});
			await setProject(p.id, {creative, progress: 0.28});
			await t.log('analyze', `Theme: ${creative.theme}. Mood: ${creative.mood}. Audience: ${creative.audience}.`);
			if (!kids) await t.log('analyze', `Picked ${PRESET_META.find((x) => x.id === creative!.captionPresetId)?.name ?? creative.captionPresetId} captions and the ${getGrade(creative.grade).name} grade`);
			await t.log('analyze', `Chose ${creative.vfx.length} effects and ${creative.sfx.length} sounds from the library${creative.broll.length ? `, ${creative.broll.length} B-roll ideas (${BROLL_MODE_META[brollMode].name})` : ''}`);
			await t.done('analyze', `${creative.theme} · ${creative.mood} · ${creative.pacing} pacing`);
		}

		// 3. Claude
		await setProject(p.id, {status: 'planning', progress: 0.3});
		await t.pending(['plan', 'storyboard', 'broll', 'render']);
		await t.start('plan', opts.notes ? 'Revising the plan with your notes' : 'Reading the transcript and the brief', FAKE_AI ? 'Test data (CUTLINE_FAKE_AI)' : undefined);
		const pacing = String(p.brief.pacing ?? (kids ? 'natural' : 'tight'));
		const onRequest = (model: string) => void t.log('plan', `Sending ${transcript!.length} words and the brief to ${model}`);
		let plan;
		if (FAKE_AI) {
			plan = kids ? fakeKidsPlan(transcript) : fakePlan(transcript, brollMode);
		} else if (kids) {
			onRequest(CLAUDE_MODEL);
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
				onRequest,
			});
		}
		const {captionPreset, ...editPlan} = plan as typeof plan & {captionPreset?: string};
		// the AI's caption pick replaces the form's choice unless the creator turned that off
		const captionStyle = !kids && p.brief.aiStyle !== false && captionPreset && captionPreset !== p.captionStyle.presetId ? {presetId: captionPreset, overrides: {}} : undefined;
		await setProject(p.id, {plan: editPlan, progress: 0.35, ...(captionStyle ? {captionStyle} : {})});
		await t.done('plan', planSummary(editPlan, transcript));

		if (variant?.review === false) await startRender(p.id);
		else {
			await setProject(p.id, {status: 'review', progress: 0.35});
			await t.wait('storyboard', 'Storyboard ready. Waiting for your approval.');
		}
	} catch (e) {
		console.error(`analyze ${projectId} failed`, e);
		const error = e instanceof ProviderError ? e.message : 'Something went wrong while planning the edit. Try again.';
		await t.failRunning(error);
		await setProject(projectId, {status: 'failed', error});
	}
}
