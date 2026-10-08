// A variant is a kind of video the app knows how to edit. Each one defines the brief form the user fills in,
// sensible defaults, and extra instructions for the edit planner. Add a new variant by adding an entry here.

export type Field =
	| {type: 'text'; name: string; label: string; placeholder?: string; required?: boolean; hint?: string}
	| {type: 'textarea'; name: string; label: string; placeholder?: string; required?: boolean; hint?: string}
	| {type: 'select'; name: string; label: string; options: {value: string; label: string}[]; default: string; hint?: string}
	| {type: 'toggle'; name: string; label: string; default: boolean; hint?: string};

export type Variant = {
	id: string;
	name: string;
	description: string;
	fields: Field[];
	defaultPresetId: string;
	// 'captioned' = talking head with a caption preset; 'kids' = the kids-edit-kit composition (its own captions)
	renderer: 'captioned' | 'kids';
	// pause after planning so the creator approves the takes and beat plan before rendering
	review: boolean;
	output: string; // shown in the UI

	// Appended to the planner prompt together with the user's answers.
	plannerGuidance: (brief: Record<string, unknown>) => string;
};

const PACING: Field = {
	type: 'select',
	name: 'pacing',
	label: 'Pacing',
	default: 'tight',
	options: [
		{value: 'natural', label: 'Natural: keep pauses, only remove long silences'},
		{value: 'tight', label: 'Tight: remove silences, filler words and retakes'},
		{value: 'punchy', label: 'Punchy: tight cuts plus frequent zoom punch-ins'},
	],
};

const pacingGuidance = (p: unknown) =>
	p === 'natural'
		? 'Remove only silences longer than ~1.2s. Keep natural pauses. Use at most 1 zoom per 15s.'
		: p === 'punchy'
			? 'Remove silences over ~0.35s, filler words (um, uh, like, you know) and false starts / retakes. Add a zoom punch-in roughly every 4–6s on emphatic moments.'
			: 'Remove silences over ~0.5s, filler words and false starts / retakes. Add a zoom punch-in on the 2–4 most emphatic moments.';

export const VARIANTS: Variant[] = [
	{
		id: 'kit-student',
		name: 'Kit Student',
		description: 'Kids explainer with the Kokoon cast: best takes, gold keyword captions, and cutaways where Kiko, Sparky, Ohmie, the Zips and Batt act out each idea.',
		defaultPresetId: 'dynamic-minimal',
		renderer: 'kids',
		review: true,
		output: '1920×1080, 25 fps, about a minute',
		fields: [
			{type: 'text', name: 'topic', label: 'Topic', placeholder: 'e.g. How an LED works', required: true},
			{
				type: 'select',
				name: 'age',
				label: 'Audience',
				default: '8-11',
				options: [
					{value: '5-7', label: 'Ages 5–7'},
					{value: '8-11', label: 'Ages 8–11'},
					{value: '12-14', label: 'Ages 12–14'},
				],
			},
			{type: 'textarea', name: 'keyTerms', label: 'Key terms', placeholder: 'LED, current, resistor', hint: 'Comma separated. Shown in gold in the captions when spoken.'},
			{type: 'text', name: 'nextVideo', label: 'Next video', placeholder: 'e.g. How resistors work', hint: 'Adds a next-video card at the end with Kiko.'},
			{
				type: 'select',
				name: 'pacing',
				label: 'Cutting',
				default: 'natural',
				options: [
					{value: 'natural', label: 'Natural: keep breathing room, remove long pauses'},
					{value: 'tight', label: 'Tight: remove pauses, filler words and slips'},
				],
			},
		],
		plannerGuidance: (b) =>
			[
				`Topic: "${String(b.topic ?? '')}". Audience: ages ${String(b.age ?? '8-11')}.`,
				b.keyTerms ? `Key terms (always gold in captions when spoken): ${String(b.keyTerms)}.` : '',
				b.nextVideo ? `End with a Next time card about: ${String(b.nextVideo)}.` : 'Only add a Next time card if the presenter mentions the next video.',
				b.pacing === 'tight' ? 'Cut pauses over ~0.5s plus filler words and slips.' : 'Keep natural breathing room; only cut pauses over ~1.2s, false starts and repeated takes.',
			]
				.filter(Boolean)
				.join('\n'),
	},
	{
		id: 'talking-head',
		name: 'Talking head',
		description: 'Creator-style short: Gemini sets the look, Claude cuts it with captions, grade, effects, sounds and B-roll.',
		defaultPresetId: 'dynamic-minimal',
		renderer: 'captioned',
		review: true,
		output: 'Same size as your clip',
		fields: [
			{type: 'textarea', name: 'goal', label: 'What is this video for?', placeholder: 'e.g. Promote my new course to beginner editors'},
			PACING,
			{
				type: 'select',
				name: 'broll',
				label: 'B-roll',
				default: 'auto',
				options: [
					{value: 'auto', label: 'Mix: cards, HyperFrames animations and AI footage, as the brief suggests'},
					{value: 'remotion', label: 'Built-in cards only (free)'},
					{value: 'none', label: 'No B-roll'},
				],
				hint: 'You can switch any clip between sources on the review screen. Nothing paid is generated until you approve.',
			},
			{type: 'toggle', name: 'aiStyle', label: 'Let the AI pick the caption style', default: true, hint: 'Off: always use the style you set below.'},
			{type: 'toggle', name: 'hook', label: 'Add a hook title in the first 2 seconds', default: false},
		],
		plannerGuidance: (b) =>
			[
				b.goal ? `Goal of the video: ${String(b.goal)}.` : '',
				'Highlight 1 keyword per sentence at most: the word that carries the point.',
				pacingGuidance(b.pacing),
				b.hook ? 'Write a hook: a short, curiosity-driven title (max 6 words).' : 'Do not write a hook.',
			]
				.filter(Boolean)
				.join('\n'),
	},
];

export const getVariant = (id: string) => VARIANTS.find((v) => v.id === id);

export function briefDefaults(v: Variant): Record<string, unknown> {
	return Object.fromEntries(v.fields.map((f) => [f.name, 'default' in f ? f.default : '']));
}
