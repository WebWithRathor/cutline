// The live processing log of a project: each step of the pipeline with its status, a one-line result,
// progress, timings and a short event log. Written by the server, shown on the project page as it runs.

export const STEP_KEYS = ['upload', 'transcribe', 'analyze', 'plan', 'storyboard', 'broll', 'render'] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export type StepStatus = 'pending' | 'running' | 'waiting' | 'done' | 'failed' | 'skipped';
export type StepEvent = {t: number; msg: string};

export type Step = {
	key: StepKey;
	label: string;
	who: string; // the tool doing the work
	status: StepStatus;
	detail?: string; // one-line result or current state
	progress?: number; // 0 – 1 while running
	startedAt?: number;
	endedAt?: number;
	events: StepEvent[];
};

export type Activity = {steps: Step[]};

export const STEP_INFO: Record<StepKey, {label: string; who: string}> = {
	upload: {label: 'Video received', who: 'Cutline'},
	transcribe: {label: 'Transcribe the speech', who: 'Whisper (on this computer)'},
	analyze: {label: 'Watch the video and write the creative brief', who: 'Gemini'},
	plan: {label: 'Plan the edit', who: 'Claude'},
	storyboard: {label: 'Storyboard approval', who: 'You'},
	broll: {label: 'Generate B-roll', who: 'HyperFrames / Higgsfield'},
	render: {label: 'Render the video', who: 'Remotion'},
};

export function newActivity(opts: {broll: boolean}): Activity {
	return {
		steps: STEP_KEYS.map((key) => ({
			key,
			...STEP_INFO[key],
			status: key === 'broll' && !opts.broll ? 'skipped' : 'pending',
			detail: key === 'broll' && !opts.broll ? 'Not used for this video' : undefined,
			events: [],
		})),
	};
}

export const MAX_EVENTS = 40;
