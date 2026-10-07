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
		description: 'Short explainer for students: clear captions, key terms highlighted, calm pacing.',
		defaultPresetId: 'smooth-rise',
		fields: [
			{type: 'text', name: 'topic', label: 'Topic', placeholder: 'e.g. How photosynthesis works', required: true},
			{
				type: 'select',
				name: 'level',
				label: 'Student level',
				default: 'middle',
				options: [
					{value: 'primary', label: 'Primary school'},
					{value: 'middle', label: 'Middle school'},
					{value: 'high', label: 'High school'},
					{value: 'college', label: 'College'},
				],
			},
			{type: 'textarea', name: 'keyTerms', label: 'Key terms to highlight', placeholder: 'chlorophyll, glucose, sunlight', hint: 'Comma separated. These always get the accent style.'},
			{...PACING, default: 'natural'} as Field,
			{type: 'toggle', name: 'hook', label: 'Add a title card in the first 2 seconds', default: true},
		],
		plannerGuidance: (b) =>
			[
				`This is an educational explainer for ${String(b.level ?? 'middle')}-level students about "${String(b.topic ?? '')}".`,
				'Prioritize clarity over speed: never cut mid-explanation, keep pauses after a new concept is introduced.',
				b.keyTerms ? `Always include these key terms in keywords when spoken: ${String(b.keyTerms)}.` : '',
				'Highlight subject-specific vocabulary and numbers. Avoid highlighting filler or generic words.',
				pacingGuidance(b.pacing),
				b.hook ? 'Write a hook: a short title (max 6 words) that states what the student will learn.' : 'Do not write a hook.',
			]
				.filter(Boolean)
				.join('\n'),
	},
	{
		id: 'talking-head',
		name: 'Talking head',
		description: 'Creator-style short: tight cuts, punchy captions, keywords that pop.',
		defaultPresetId: 'dynamic-minimal',
		fields: [
			{type: 'textarea', name: 'goal', label: 'What is this video for?', placeholder: 'e.g. Promote my new course to beginner editors'},
			PACING,
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
