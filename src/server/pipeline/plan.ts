import Anthropic from '@anthropic-ai/sdk';
import type {EditPlan, KeepRange, Word} from '@/remotion/types';
import {ProviderError} from './transcribe';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

// Gap (ms) between words above which the silence is cut, per pacing choice.
const SILENCE_MS: Record<string, number> = {natural: 1200, tight: 500, punchy: 350};

type RawPlan = {
	remove: {from: number; to: number; reason: string}[];
	keywords: number[];
	zooms: {at: number; words: number}[];
	hook: string | null;
};

const TOOL: Anthropic.Tool = {
	name: 'submit_edit_plan',
	description: 'Submit the edit plan for this video. Word references are indices into the numbered transcript.',
	input_schema: {
		type: 'object',
		properties: {
			remove: {
				type: 'array',
				description: 'Word index ranges (inclusive) to cut: filler words, false starts, repeated retakes (keep the LAST good take), off-topic asides.',
				items: {
					type: 'object',
					properties: {
						from: {type: 'integer'},
						to: {type: 'integer'},
						reason: {type: 'string', enum: ['filler', 'retake', 'false-start', 'off-topic']},
					},
					required: ['from', 'to', 'reason'],
				},
			},
			keywords: {type: 'array', description: 'Indices of words to visually emphasize in captions.', items: {type: 'integer'}},
			zooms: {
				type: 'array',
				description: 'Punch-in zooms: start at word index `at` and hold for `words` words (2-8).',
				items: {type: 'object', properties: {at: {type: 'integer'}, words: {type: 'integer'}}, required: ['at', 'words']},
			},
			hook: {type: ['string', 'null'], description: 'Optional on-screen title for the first 2 seconds, max 6 words, or null.'},
		},
		required: ['remove', 'keywords', 'zooms', 'hook'],
	},
};

export async function planEdit(opts: {apiKey: string; words: Word[]; variantName: string; guidance: string; pacing: string}): Promise<EditPlan> {
	const {words} = opts;
	if (!words.length) return {keepRanges: [], keywords: [], zooms: []};
	const transcript = words.map((w, i) => `${i}\t${(w.startMs / 1000).toFixed(2)}\t${w.text}`).join('\n');
	const client = new Anthropic({apiKey: opts.apiKey});

	let raw: RawPlan;
	try {
		const msg = await client.messages.create({
			model: MODEL,
			max_tokens: 4096,
			tools: [TOOL],
			tool_choice: {type: 'tool', name: TOOL.name},
			system:
				'You are a senior short-form video editor. You plan edits for talking-head videos from a word-level transcript. ' +
				'Be conservative with cuts: never cut words that carry meaning, and never leave a sentence grammatically broken. ' +
				'Silences are handled automatically; only flag words to remove. Choose keywords that carry the point of each sentence ' +
				'(nouns, numbers, strong verbs), roughly one per sentence, never function words.',
			messages: [
				{
					role: 'user',
					content: `Video type: ${opts.variantName}\n\nEditing brief:\n${opts.guidance}\n\nTranscript (index, start seconds, word):\n${transcript}`,
				},
			],
		});
		const block = msg.content.find((b) => b.type === 'tool_use');
		if (!block || block.type !== 'tool_use') throw new ProviderError('The planner returned no edit plan.');
		raw = block.input as RawPlan;
	} catch (e) {
		if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
			throw new ProviderError('Anthropic rejected your API key. Replace it in API keys and try again.');
		if (e instanceof Anthropic.RateLimitError) throw new ProviderError('Anthropic rate-limited the request or your account is out of credit.');
		if (e instanceof Anthropic.APIError) throw new ProviderError(`Anthropic request failed (${e.status}): ${e.message}`);
		throw e;
	}
	return toPlan(raw, words, SILENCE_MS[opts.pacing] ?? SILENCE_MS.tight);
}

// Turns word-index decisions into time ranges. Deterministic, so the LLM never has to do timestamp math.
export function toPlan(raw: RawPlan, words: Word[], silenceMs: number): EditPlan {
	const n = words.length;
	const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < n;
	const removed = new Set<number>();
	for (const r of raw.remove ?? []) {
		if (!valid(r.from) || !valid(r.to) || r.to < r.from || r.to - r.from > 60) continue;
		for (let i = r.from; i <= r.to; i++) removed.add(i);
	}
	if (removed.size > n * 0.5) removed.clear(); // safety: a plan that deletes half the video is not trusted

	const PAD_BEFORE = 90;
	const PAD_AFTER = 160;
	const keepRanges: KeepRange[] = [];
	let cur: KeepRange | null = null;
	let prevEnd = -Infinity;
	for (let i = 0; i < n; i++) {
		if (removed.has(i)) continue;
		const w = words[i];
		const start = Math.max(0, w.startMs - PAD_BEFORE);
		if (cur && w.startMs - prevEnd <= silenceMs && !removed.has(i - 1)) {
			cur.endMs = w.endMs + PAD_AFTER;
		} else {
			if (cur) keepRanges.push(cur);
			cur = {startMs: start, endMs: w.endMs + PAD_AFTER};
		}
		prevEnd = w.endMs;
	}
	if (cur) keepRanges.push(cur);
	// avoid overlapping padding between neighbours
	for (let i = 1; i < keepRanges.length; i++) {
		if (keepRanges[i].startMs < keepRanges[i - 1].endMs) keepRanges[i].startMs = keepRanges[i - 1].endMs;
	}

	const keywords = [...new Set((raw.keywords ?? []).filter((i) => valid(i) && !removed.has(i)).map((i) => words[i].text.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase()))].filter(
		(k) => k.length > 2,
	);
	const zooms = (raw.zooms ?? [])
		.filter((z) => valid(z.at) && !removed.has(z.at))
		.map((z) => {
			const end = words[Math.min(n - 1, z.at + Math.max(2, Math.min(8, z.words || 3)))];
			return {atMs: words[z.at].startMs, durationMs: Math.max(600, end.endMs - words[z.at].startMs), scale: 1.12};
		});
	return {keepRanges, keywords, zooms, hook: raw.hook?.trim() || undefined};
}
