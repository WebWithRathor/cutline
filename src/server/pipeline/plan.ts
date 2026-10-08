import Anthropic from '@anthropic-ai/sdk';
import type {EditPlan, KeepRange, RemovedRange, Word} from '@/remotion/types';
import {ProviderError} from './transcribe';

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

// Gap (ms) between words above which the silence is cut, per pacing choice.
export const SILENCE_MS: Record<string, number> = {natural: 1200, tight: 500, punchy: 350};

export type RawCuts = {
	remove: {from: number; to: number; reason: string}[];
	keywords: number[];
};

type RawPlan = RawCuts & {
	zooms: {at: number; words: number}[];
	hook: string | null;
};

export const REMOVE_SCHEMA = {
	type: 'array',
	description:
		'Word index ranges (inclusive) to cut: filler words, false starts, slips, and repeated takes. When a line is said more than once, keep the LAST complete, clean take and remove the others. Never cut words that carry meaning or leave a sentence broken.',
	items: {
		type: 'object',
		properties: {
			from: {type: 'integer'},
			to: {type: 'integer'},
			reason: {type: 'string', enum: ['filler', 'retake', 'false-start', 'slip', 'off-topic']},
		},
		required: ['from', 'to', 'reason'],
	},
} as const;

const TOOL: Anthropic.Tool = {
	name: 'submit_edit_plan',
	description: 'Submit the edit plan for this video. Word references are indices into the numbered transcript.',
	input_schema: {
		type: 'object',
		properties: {
			remove: REMOVE_SCHEMA,
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

export const numberedTranscript = (words: Word[]) => words.map((w, i) => `${i}\t${(w.startMs / 1000).toFixed(2)}\t${w.text}`).join('\n');

// One forced tool call; maps provider errors to messages a user can act on.
export async function callPlanner<T>(opts: {apiKey: string; tool: Anthropic.Tool; system: string; user: string; maxTokens?: number}): Promise<T> {
	const client = new Anthropic({apiKey: opts.apiKey});
	try {
		const msg = await client.messages.create({
			model: MODEL,
			max_tokens: opts.maxTokens ?? 4096,
			tools: [opts.tool],
			tool_choice: {type: 'tool', name: opts.tool.name},
			system: opts.system,
			messages: [{role: 'user', content: opts.user}],
		});
		const block = msg.content.find((b) => b.type === 'tool_use');
		if (!block || block.type !== 'tool_use') throw new ProviderError('The planner returned no edit plan.');
		return block.input as T;
	} catch (e) {
		if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
			throw new ProviderError('Anthropic rejected your API key. Replace it in API keys and try again.');
		if (e instanceof Anthropic.RateLimitError) throw new ProviderError('Anthropic rate-limited the request or your account is out of credit.');
		if (e instanceof Anthropic.APIError) throw new ProviderError(`Anthropic request failed (${e.status}): ${e.message}`);
		throw e;
	}
}

export async function planEdit(opts: {apiKey: string; words: Word[]; variantName: string; guidance: string; pacing: string; notes?: string}): Promise<EditPlan> {
	if (!opts.words.length) return {keepRanges: [], keywords: [], zooms: []};
	const raw = await callPlanner<RawPlan>({
		apiKey: opts.apiKey,
		tool: TOOL,
		system:
			'You are a senior short-form video editor. You plan edits for talking-head videos from a word-level transcript. ' +
			'Be conservative with cuts: never cut words that carry meaning, and never leave a sentence grammatically broken. ' +
			'Silences are handled automatically; only flag words to remove. Choose keywords that carry the point of each sentence ' +
			'(nouns, numbers, strong verbs), roughly one per sentence, never function words.',
		user: `Video type: ${opts.variantName}\n\nEditing brief:\n${opts.guidance}${opts.notes ? `\n\nNotes from the creator on the previous plan:\n${opts.notes}` : ''}\n\nTranscript (index, start seconds, word):\n${numberedTranscript(opts.words)}`,
	});
	return toPlan(raw, opts.words, SILENCE_MS[opts.pacing] ?? SILENCE_MS.tight);
}

// Turns word-index decisions into time ranges. Deterministic, so the LLM never has to do timestamp math.
export function toPlan(raw: RawCuts & Partial<Pick<RawPlan, 'zooms' | 'hook'>>, words: Word[], silenceMs: number): EditPlan {
	const n = words.length;
	const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < n;
	const removed = new Set<number>();
	const removedRanges: RemovedRange[] = [];
	for (const r of raw.remove ?? []) {
		if (!valid(r.from) || !valid(r.to) || r.to < r.from || r.to - r.from > 80) continue;
		for (let i = r.from; i <= r.to; i++) removed.add(i);
		removedRanges.push({from: r.from, to: r.to, reason: String(r.reason ?? 'cut').slice(0, 20)});
	}
	if (removed.size > n * 0.6) {
		// safety: a plan that deletes most of the video is not trusted
		removed.clear();
		removedRanges.length = 0;
	}

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
	for (let i = 1; i < keepRanges.length; i++) {
		if (keepRanges[i].startMs < keepRanges[i - 1].endMs) keepRanges[i].startMs = keepRanges[i - 1].endMs;
	}

	const keywords = [
		...new Set((raw.keywords ?? []).filter((i) => valid(i) && !removed.has(i)).map((i) => words[i].text.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase())),
	].filter((k) => k.length > 1);
	const zooms = (raw.zooms ?? [])
		.filter((z) => valid(z.at) && !removed.has(z.at))
		.map((z) => {
			const end = words[Math.min(n - 1, z.at + Math.max(2, Math.min(8, z.words || 3)))];
			return {atMs: words[z.at].startMs, durationMs: Math.max(600, end.endMs - words[z.at].startMs), scale: 1.12};
		});
	return {keepRanges, keywords, zooms, hook: raw.hook?.trim() || undefined, removed: removedRanges};
}
