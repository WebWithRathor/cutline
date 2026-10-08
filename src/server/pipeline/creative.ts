import {PRESET_META} from '@/remotion/captions/meta';
import {BROLL_META, BROLL_MODE_META, GRADES, SFX_META, VFX_META, type BrollMode} from '@/remotion/fx/meta';
import {GRADE_IDS, SFX_IDS, VFX_TYPES, type BrollSource, type CreativeBrief, type GradeId, type SfxId, type VfxType, type Word} from '@/remotion/types';
import {mkdir, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Gemini, GeminiError, S, type GeminiFile} from './gemini';
import {run} from './transcribe';

// Gemini watches the raw video (picture and sound) and writes the creative brief Claude edits from.

const MIME: Record<string, string> = {mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/avi'};
export const videoMime = (key: string) => MIME[key.split('.').pop()?.toLowerCase() ?? ''] ?? 'video/mp4';

// The transcript as timed lines, so Gemini can quote exact spoken words for each idea.
export function timedLines(words: Word[]): string {
	const lines: string[] = [];
	let cur: Word[] = [];
	const flush = () => {
		if (cur.length) lines.push(`[${(cur[0].startMs / 1000).toFixed(1)}s] ${cur.map((w) => w.text).join(' ')}`);
		cur = [];
	};
	words.forEach((w, i) => {
		cur.push(w);
		const next = words[i + 1];
		if (/[.?!]["”']?$/.test(w.text) || cur.length >= 18 || (next && next.startMs - w.endMs > 900)) flush();
	});
	flush();
	return lines.join('\n');
}

const list = <K extends string>(rec: Record<K, {name: string; description: string}>) =>
	(Object.keys(rec) as K[]).map((k) => `- ${k}: ${rec[k].name}. ${rec[k].description}`).join('\n');

const SYSTEM = `You are the creative director of a short-form video studio. You watch a creator's raw recording and write the creative brief a video editor will follow.
Judge the content itself: what it is about, who it is for, the speaker's energy, the setting, lighting and colours in the frame, and what would make it hold attention.
Be specific and practical. Every effect, sound and B-roll idea must point at a moment by quoting the exact spoken words from the transcript ("when"), 2-6 words, copied verbatim.
Restraint beats clutter: effects and sounds should land on real beats (reveals, numbers, punchlines, topic changes), not every sentence.`;

// Gemini only needs to watch the video, so it gets a light preview: 480p on the short side, 2 frames per
// second, mono audio. A minute of 1080p footage becomes about 2 MB: fast to upload, far less quota.
async function makePreview(input: string, out: string): Promise<boolean> {
	try {
		await run(
			'ffmpeg',
			['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vf', "scale='if(gt(iw,ih),-2,min(480,iw))':'if(gt(iw,ih),min(480,ih),-2)'", '-r', '2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '48k', '-ac', '1', '-movflags', '+faststart', out],
			() => undefined,
			15 * 60 * 1000,
		);
		return true;
	} catch (e) {
		console.error('preview for Gemini failed, sending the original', e);
		return false;
	}
}

// Uploaded files stay on Gemini for 48 hours: a retry or re-plan reuses the upload instead of sending it again.
const uploads = new Map<string, {file: GeminiFile; at: number}>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function analyzeCreative(opts: {
	apiKey: string;
	cacheKey: string; // the project id
	source: string; // local path or URL ffmpeg can read
	readOriginal: () => Promise<Buffer>;
	mimeType: string;
	durationSec: number;
	words: Word[];
	variantName: string;
	guidance: string;
	brollMode: BrollMode;
	captioned: boolean;
	report: (msg: string) => void;
}): Promise<CreativeBrief> {
	const g = new Gemini(opts.apiKey);
	const sources = BROLL_MODE_META[opts.brollMode].sources;
	const schema = S.obj({
		summary: S.str('One or two sentences: what the video is about.'),
		theme: S.str('The theme / niche, a few words.'),
		mood: S.str('The emotional tone, a few words.'),
		audience: S.str('Who it is for.'),
		pacing: S.str('How fast the edit should feel.', ['calm', 'steady', 'fast']),
		palette: S.arr(S.str('hex colour like #1A2B3C'), '3-5 colours that suit the video and its setting, for cards and accents.'),
		captionPresetId: S.str('The caption style that fits best.', PRESET_META.map((p) => p.id)),
		captionWhy: S.str('Why that caption style, one sentence.'),
		grade: S.str('The colour grade that suits it.', GRADE_IDS),
		gradeWhy: S.str('Why that grade, one sentence, mention the footage lighting.'),
		vfx: S.arr(S.obj({type: S.str(undefined, VFX_TYPES), when: S.str('exact spoken words, 2-6 words')}), '0-8 visual effects from the library that fit this video and its mood.'),
		sfx: S.arr(S.obj({sound: S.str(undefined, SFX_IDS), when: S.str('exact spoken words, 2-6 words')}), '0-12 sound effects from the library that fit this video and its mood.'),
		broll: S.arr(
			S.obj({
				when: S.str('exact spoken words where it starts, 2-6 words'),
				idea: S.str(opts.brollMode === 'higgsfield' ? 'The shot to generate: subject, action, setting, camera, light.' : 'What the viewer sees, concrete.'),
				source: S.str('Best way to make it.', sources.length ? sources : ['remotion']),
				why: S.str('one short sentence'),
			}),
			opts.brollMode === 'none' ? 'Always empty: this video has no B-roll.' : 'B-roll cutaways that illustrate what is said: 0-6, roughly one per 10-15 seconds where it helps.',
		),
		notes: S.str('Anything else the editor should know: hook, what to cut, tone to keep. Two or three sentences.'),
	});
	const prompt = `Video type: ${opts.variantName}. Length: ${opts.durationSec.toFixed(0)} s.
Creator's brief:
${opts.guidance || '(none)'}

Caption styles:
${PRESET_META.map((p) => `- ${p.id}: ${p.name}. ${p.description}`).join('\n')}

Colour grades:
${GRADES.map((g) => `- ${g.id}: ${g.description}`).join('\n')}

Visual effects:
${list(VFX_META)}

Sound effects:
${list(SFX_META)}

B-roll: the creator chose "${BROLL_MODE_META[opts.brollMode].name}". ${BROLL_MODE_META[opts.brollMode].description}
${sources.map((s) => `- ${s}: ${BROLL_META[s].description} Cost: ${BROLL_META[s].cost}.`).join('\n')}
${opts.brollMode === 'higgsfield' ? 'Suggest real-world footage ideas that AI video can generate well (places, objects, people doing things, nature, cities); no on-screen text.' : opts.brollMode === 'motion' ? 'Suggest motion-graphics ideas: titles, big numbers, lists, quotes (remotion) or custom animated diagrams, processes and comparisons (hyperframes).' : ''}
${opts.captioned ? '' : '\nThis video type draws its own captions and cartoon cutaways: still pick a caption style, but suggest B-roll only where a real-world shot would help, and keep effects gentle.'}
Transcript with timestamps:
${timedLines(opts.words)}`;

	const file = await uploadVideo(g, opts);
	const models = await g.candidates();
	let raw: Record<string, unknown> | null = null;
	let lastErr: unknown = null;
	for (const [i, model] of models.entries()) {
		for (let attempt = 1; attempt <= 2 && !raw; attempt++) {
			try {
				opts.report(`${model} is watching the video with the transcript`);
				raw = await g.json<Record<string, unknown>>({
					model,
					system: SYSTEM,
					parts: [{fileData: {fileUri: file.uri, mimeType: file.mimeType}}, {text: prompt}],
					schema,
					maxTokens: 12000,
					lowMediaRes: true, // 66 tokens a frame instead of 258: plenty to judge the look and feel
				});
			} catch (e) {
				if (!(e instanceof GeminiError) || e.status === 401 || e.status === 403) throw e;
				lastErr = e;
				// a per-minute limit or a dropped connection: wait the time Gemini asks for, then try once more
				const wait = e.status === 429 ? (e.quotaExhausted ? 0 : e.retryAfterMs || 30000) : e.retryAfterMs;
				if (attempt === 1 && wait > 0 && wait <= 65000) {
					opts.report(`${e.message} Waiting ${Math.ceil(wait / 1000)} s, then trying again`);
					await sleep(wait);
					continue;
				}
				break;
			}
		}
		if (raw) break;
		if (i + 1 < models.length) opts.report(`${(lastErr as Error).message} Switching to ${models[i + 1]}`);
	}
	if (!raw) {
		const e = lastErr as GeminiError | null;
		throw new GeminiError(
			e?.status === 429
				? `${e.message} Every Gemini model your key can use is out of quota right now. Wait a few minutes and press Try again, or turn on billing for the key in Google AI Studio (free keys have small limits).`
				: (e?.message ?? 'Gemini could not analyse the video.'),
			e?.status ?? 0,
		);
	}
	uploads.delete(opts.cacheKey);
	await g.remove(file);
	return sanitizeCreative(raw, {brollMode: opts.brollMode});
}

async function uploadVideo(g: Gemini, opts: {cacheKey: string; source: string; readOriginal: () => Promise<Buffer>; mimeType: string; report: (msg: string) => void}): Promise<GeminiFile> {
	const cached = uploads.get(opts.cacheKey);
	if (cached && Date.now() - cached.at < 40 * 3600 * 1000 && (await g.exists(cached.file))) {
		opts.report('Reusing the video already uploaded to Gemini');
		return cached.file;
	}
	const dir = path.join(os.tmpdir(), 'cutline-gemini', `${opts.cacheKey}-${Date.now()}`);
	await mkdir(dir, {recursive: true});
	try {
		opts.report('Making a light 480p preview for Gemini');
		const preview = path.join(dir, 'preview.mp4');
		const ok = await makePreview(opts.source, preview);
		const bytes = ok ? await readFile(preview) : await opts.readOriginal();
		const mime = ok ? 'video/mp4' : opts.mimeType;
		opts.report(`Uploading ${ok ? 'the preview' : 'the video'} to Gemini (${(bytes.length / 1e6).toFixed(1)} MB)`);
		const file = await g.upload(bytes, mime, 'cutline-analysis', (sec) => opts.report(`Gemini is processing the video (${sec} s)`));
		uploads.set(opts.cacheKey, {file, at: Date.now()});
		return file;
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
}

const str = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
const oneOf = <T extends string>(v: unknown, all: readonly T[], fallback: T): T => (all.includes(v as T) ? (v as T) : fallback);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);

export function sanitizeCreative(raw: Record<string, unknown>, opts: {brollMode: BrollMode}): CreativeBrief {
	const sources = BROLL_MODE_META[opts.brollMode].sources;
	const palette = (Array.isArray(raw.palette) ? raw.palette : [])
		.map((c) => String(c).trim())
		.filter((c) => /^#[0-9a-f]{6}$/i.test(c))
		.slice(0, 5);
	return {
		summary: str(raw.summary, 400),
		theme: str(raw.theme, 80),
		mood: str(raw.mood, 80),
		audience: str(raw.audience, 120),
		pacing: oneOf(raw.pacing, ['calm', 'steady', 'fast'] as const, 'steady'),
		palette: palette.length >= 2 ? palette : ['#111111', '#FFFFFF', '#FFD43B'],
		captionPresetId: PRESET_META.some((p) => p.id === raw.captionPresetId) ? String(raw.captionPresetId) : 'dynamic-minimal',
		captionWhy: str(raw.captionWhy, 240),
		grade: oneOf<GradeId>(raw.grade, GRADE_IDS, 'natural'),
		gradeWhy: str(raw.gradeWhy, 240),
		vfx: arr(raw.vfx)
			.filter((v) => VFX_TYPES.includes(v.type as VfxType) && str(v.when, 80))
			.slice(0, 10)
			.map((v) => ({type: v.type as VfxType, when: str(v.when, 80)})),
		sfx: arr(raw.sfx)
			.filter((v) => SFX_IDS.includes(v.sound as SfxId) && str(v.when, 80))
			.slice(0, 16)
			.map((v) => ({sound: v.sound as SfxId, when: str(v.when, 80)})),
		broll: arr(raw.broll)
			.filter((b) => sources.length && str(b.idea, 300))
			.slice(0, 8)
			.map((b) => {
				const source = oneOf<BrollSource>(b.source, sources, sources[0]);
				return {when: str(b.when, 80), idea: str(b.idea, 300), source, why: str(b.why, 200)};
			}),
		notes: str(raw.notes, 600),
	};
}
