import type Anthropic from '@anthropic-ai/sdk';
import {characterVocabulary} from '@/remotion/kids/scenes';
import {SFX_META} from '@/remotion/fx/meta';
import {KIDS_CHARACTERS, KIDS_COLORS, type CreativeBrief, type EditPlan, type KidsCharacter, type KidsColor, type KidsOverlay, type KidsScene, type KidsShot, type Word} from '@/remotion/types';
import {SFX_SCHEMA, creativeText, sanitizeLook} from './fx';
import {REMOVE_SCHEMA, SILENCE_MS, callPlanner, numberedTranscript, toPlan, type RawCuts} from './plan';

// The Kit Student planner: best takes + a beat plan built from the kids-edit-kit's ready beats.
// The plan is data; the composition draws it with the kit. Nothing the model writes is executed.

const CAST = `
- kiko: the curious host (round white face, atom antenna). Asks the questions kids would ask. Use on camera (hello, count, next video) and for reactions in any topic.
- sparky: an LED. Glows when current flows the right way, gets scared/hot when there is too much current, sleepy/dim when there is too little.
- ohmie: a resistor. Slows current down, holds a SLOW sign. Strict when guarding, relaxed when there is little to do.
- zips: a crowd of electrons (small gold balls). The current. In a series loop the current is the same everywhere.
- batt: a 9V battery. Pushes the Zips around the circuit (voltage / energy). Proud and strong.
- grandpaBulb: an old incandescent bulb. Makes light by heating a thin wire, so he gets hot.`;

const RECIPE = `
Beats (pick per line of the script):
- Hello (camera): Kiko pops in and greets, at the very start.
- Compare (cutaway "cast"): two characters side by side, e.g. "both make light!".
- Count (camera "count"): Kiko holds a sign like "2 RULES" or "3 STEPS" when the presenter announces a list.
- Do / don't (cutaway "doDont"): right way vs wrong way.
- Danger (cutaway "cast"): something goes wrong (scared/hot moods, a short warning bubble).
- Fix (cutaway "cast"): the helper character solves it (e.g. Ohmie slows the Zips).
- Just right (cutaway "justRight"): too much / just right / too little. It always ends on just right.
- Next time (camera "nextTime"): a card for the next video, near the end, only if the presenter mentions what comes next.
- Stickers (camera "stickers"): 1-3 short sticker words beside the presenter's head for key facts.`;

const RULES = `
Hard rules:
- The presenter's recorded voice is the soundtrack. Characters never speak over the presenter; they react with faces, signs, stickers and bubbles of FIVE WORDS OR FEWER.
- Only true science in the visuals. Use a character only for what it really is (an LED is sparky, a resistor is ohmie, current is zips...). If the topic has nothing to do with the cast, use Kiko and stickers/titles instead of misusing a character.
- Alternate camera and cutaway shots. Something new every 3-6 seconds. The first shot is a camera shot starting at word 0, usually with Hello.
- Every time reference is a word index from the transcript (the moment that word is spoken). Times must not point at words you remove.
- Keep labels short: tags up to 4 words, signs up to 2 words, stickers up to 3 words.`;

const wordRef = (d: string) => ({type: 'integer', description: d});

const TOOL: Anthropic.Tool = {
	name: 'submit_kids_plan',
	description: 'Submit the cut and the beat plan for this kids explainer. All word references are transcript indices.',
	input_schema: {
		type: 'object',
		properties: {
			remove: REMOVE_SCHEMA,
			keywords: {type: 'array', description: 'Indices of key science words to show in gold in the captions (about one per sentence).', items: {type: 'integer'}},
			shots: {
				type: 'array',
				description: 'Shots in order. Each starts when its startWord is spoken and lasts until the next shot.',
				items: {
					type: 'object',
					properties: {
						kind: {type: 'string', enum: ['camera', 'cutaway']},
						startWord: wordRef('When the shot starts.'),
						why: {type: 'string', description: 'The beat and what it shows, in a few words (shown to the creator for approval).'},
						zoom: {type: 'array', items: {type: 'number'}, description: 'camera only: [start, end] zoom between 1.0 and 1.2, e.g. [1.0, 1.06].'},
						overlay: {
							type: 'object',
							description: 'camera only (optional).',
							properties: {
								type: {type: 'string', enum: ['hello', 'count', 'stickers', 'nextTime']},
								atWord: wordRef('When it pops in.'),
								text: {type: 'string', description: 'hello: greeting, e.g. "Hi! Let\'s learn!"'},
								sign: {type: 'string', description: 'count: e.g. "2 RULES"'},
								title: {type: 'string', description: 'nextTime: topic of the next video'},
								sub: {type: 'string', description: 'nextTime: one short line'},
								guest: {type: 'string', enum: [...KIDS_CHARACTERS], description: 'nextTime: character to show next to Kiko'},
								items: {
									type: 'array',
									description: 'stickers: 1-3 items',
									items: {
										type: 'object',
										properties: {atWord: {type: 'integer'}, untilWord: {type: 'integer'}, label: {type: 'string'}, color: {type: 'string', enum: [...KIDS_COLORS]}},
										required: ['atWord', 'label', 'color'],
									},
								},
							},
							required: ['type', 'atWord'],
						},
						scene: {
							type: 'object',
							description: 'cutaway only.',
							properties: {
								type: {type: 'string', enum: ['cast', 'doDont', 'justRight']},
								label: {type: 'string', description: 'Yellow tag in the corner, up to 4 words.'},
								actors: {
									type: 'array',
									description: 'cast: 1-3 characters.',
									items: {
										type: 'object',
										properties: {character: {type: 'string', enum: [...KIDS_CHARACTERS]}, mood: {type: 'string'}, arm: {type: 'string'}, atWord: {type: 'integer'}},
										required: ['character', 'atWord'],
									},
								},
								bubble: {
									type: 'object',
									description: 'cast: optional speech bubble, five words or fewer.',
									properties: {text: {type: 'string'}, atWord: {type: 'integer'}, actor: {type: 'integer', description: 'index into actors'}},
									required: ['text', 'atWord'],
								},
								title: {type: 'object', description: 'cast: optional handwritten title.', properties: {text: {type: 'string'}, atWord: {type: 'integer'}}, required: ['text', 'atWord']},
								character: {type: 'string', enum: [...KIDS_CHARACTERS], description: 'doDont / justRight: who acts it out'},
								okWord: wordRef('doDont: when the right way gets its tick'),
								badWord: wordRef('doDont: when the wrong way appears'),
								muchWord: wordRef('justRight: "too much" card'),
								littleWord: wordRef('justRight: "too little" card'),
								endWord: wordRef('justRight: "just right" card (last)'),
							},
							required: ['type'],
						},
					},
					required: ['kind', 'startWord', 'why'],
				},
			},
			sfx: {...SFX_SCHEMA, description: 'Playful sound effects on exact kept words: a pop when a character or sticker appears, a whoosh on cutaway wipes, a ding on a right answer. Gentle, one per beat at most.'},
		},
		required: ['remove', 'keywords', 'shots', 'sfx'],
	},
};

type RawShot = {
	kind: string;
	startWord: number;
	why?: string;
	zoom?: number[];
	overlay?: Record<string, unknown> & {type?: string; atWord?: number; items?: Record<string, unknown>[]};
	scene?: Record<string, unknown> & {type?: string; actors?: Record<string, unknown>[]};
};
type RawKids = RawCuts & {shots: RawShot[]; sfx?: unknown};

const words5 = (s: unknown) => String(s ?? '').trim().split(/\s+/).slice(0, 5).join(' ');
const short = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);
const isChar = (c: unknown): c is KidsCharacter => KIDS_CHARACTERS.includes(c as KidsCharacter);
const isColor = (c: unknown): c is KidsColor => KIDS_COLORS.includes(c as KidsColor);

// Validates and clamps the model's beat plan so the composition always gets drawable data.
export function sanitizeShots(raw: RawShot[] | undefined, n: number): KidsShot[] {
	const idx = (v: unknown, fallback: number) => {
		const i = Math.round(Number(v));
		return Number.isFinite(i) ? Math.max(0, Math.min(n - 1, i)) : fallback;
	};
	const shots: KidsShot[] = [];
	for (const s of raw ?? []) {
		const startWord = idx(s.startWord, 0);
		const why = short(s.why, 120) || undefined;
		if (s.kind === 'camera') {
			const z = Array.isArray(s.zoom) ? s.zoom.map(Number) : [];
			const zoom: [number, number] = [Math.min(1.2, Math.max(1, z[0] || 1)), Math.min(1.2, Math.max(1, z[1] || z[0] || 1.05))];
			const o = s.overlay;
			let overlay: KidsOverlay | undefined;
			if (o?.type === 'hello') overlay = {type: 'hello', atWord: idx(o.atWord, startWord), text: words5(o.text) || 'Hi!'};
			else if (o?.type === 'count' && o.sign) overlay = {type: 'count', atWord: idx(o.atWord, startWord), sign: short(o.sign, 12).toUpperCase()};
			else if (o?.type === 'nextTime' && o.title)
				overlay = {type: 'nextTime', atWord: idx(o.atWord, startWord), title: short(o.title, 22), sub: short(o.sub, 34), guest: isChar(o.guest) ? o.guest : undefined};
			else if (o?.type === 'stickers' && Array.isArray(o.items) && o.items.length)
				overlay = {
					type: 'stickers',
					items: o.items.slice(0, 3).map((it) => ({
						atWord: idx(it.atWord, startWord),
						untilWord: it.untilWord !== undefined ? idx(it.untilWord, n - 1) : undefined,
						label: short(String(it.label ?? '').split(/\s+/).slice(0, 3).join(' '), 18),
						color: isColor(it.color) ? it.color : 'lemon',
					})),
				};
			shots.push({kind: 'camera', startWord, zoom, overlay, why});
			continue;
		}
		const sc = s.scene;
		if (!sc) continue;
		const label = short(String(sc.label ?? '').split(/\s+/).slice(0, 4).join(' '), 30);
		let scene: KidsScene | undefined;
		if (sc.type === 'cast') {
			const actors = (sc.actors ?? [])
				.filter((a) => isChar(a.character))
				.slice(0, 3)
				.map((a) => ({character: a.character as KidsCharacter, mood: a.mood ? short(a.mood, 12) : undefined, arm: a.arm ? short(a.arm, 12) : undefined, atWord: idx(a.atWord, startWord)}));
			if (!actors.length) continue;
			const b = sc.bubble as Record<string, unknown> | undefined;
			const tt = sc.title as Record<string, unknown> | undefined;
			scene = {
				type: 'cast',
				label: label || undefined,
				actors,
				bubble: b?.text ? {text: words5(b.text), atWord: idx(b.atWord, startWord), actor: Math.max(0, Math.min(actors.length - 1, Number(b.actor) || 0))} : undefined,
				title: tt?.text ? {text: short(tt.text, 32), atWord: idx(tt.atWord, startWord)} : undefined,
			};
		} else if (sc.type === 'doDont' && isChar(sc.character)) {
			scene = {type: 'doDont', label: label || 'The right way', character: sc.character, okWord: idx(sc.okWord, startWord), badWord: idx(sc.badWord, startWord)};
		} else if (sc.type === 'justRight' && isChar(sc.character)) {
			scene = {
				type: 'justRight',
				label: label || 'Just right',
				character: sc.character,
				muchWord: idx(sc.muchWord, startWord),
				littleWord: idx(sc.littleWord, startWord),
				endWord: idx(sc.endWord, startWord),
			};
		}
		if (scene) shots.push({kind: 'cutaway', startWord, scene, why});
	}
	shots.sort((a, b) => a.startWord - b.startWord);
	if (!shots.length || shots[0].kind !== 'camera' || shots[0].startWord !== 0) shots.unshift({kind: 'camera', startWord: 0, zoom: [1, 1.05], why: 'Opening shot'});
	return shots;
}

export async function planKids(opts: {apiKey: string; words: Word[]; guidance: string; pacing: string; notes?: string; previous?: EditPlan | null; creative?: CreativeBrief | null}): Promise<EditPlan> {
	if (!opts.words.length) return {keepRanges: [], keywords: [], zooms: [], shots: []};
	const vocab = characterVocabulary()
		.map((c) => `${c.character}: moods ${c.moods.join(', ')}${c.arms.length ? `; arms ${c.arms.join(', ')}` : ''}`)
		.join('\n');
	const previous =
		opts.notes && opts.previous
			? `\n\nYour previous plan (JSON):\n${JSON.stringify({removed: opts.previous.removed, shots: opts.previous.shots, sfx: opts.previous.sfx})}\n\nThe creator's notes on it (follow them):\n${opts.notes}`
			: opts.notes
				? `\n\nNotes from the creator:\n${opts.notes}`
				: '';
	const raw = await callPlanner<RawKids>({
		apiKey: opts.apiKey,
		tool: TOOL,
		maxTokens: 8000,
		system:
			'You edit raw talking-head recordings into ~1 minute kid-friendly explainers with the Kokoon cast. ' +
			'You pick the best take of each line, then plan sticker-style cutaways where the cast acts out each idea.\n' +
			`Cast:${CAST}\n\nCharacter moods and arm poses you may use:\n${vocab}\n${RECIPE}\n${RULES}\n\nSound effects:\n${Object.entries(SFX_META)
				.map(([k, v]) => `- ${k}: ${v.description}`)
				.join('\n')}\n\nA director watched the video and wrote a creative brief. Use its mood, pacing and sound ideas; ignore its caption, grade and B-roll choices (this format has its own).`,
		user: `Editing brief:\n${opts.guidance}\n\n${creativeText(opts.creative)}${previous}\n\nTranscript (index, start seconds, word):\n${numberedTranscript(opts.words)}`,
	});
	const base = toPlan(raw, opts.words, SILENCE_MS[opts.pacing] ?? SILENCE_MS.natural);
	const removed = new Set(base.removed?.flatMap((r) => Array.from({length: r.to - r.from + 1}, (_, k) => r.from + k)) ?? []);
	const {sfx} = sanitizeLook({sfx: raw.sfx}, opts.words, removed, {brollMode: 'none', higgsfield: false});
	return {...base, zooms: [], hook: undefined, shots: sanitizeShots(raw.shots, opts.words.length), sfx};
}
