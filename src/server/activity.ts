import {eq} from 'drizzle-orm';
import {MAX_EVENTS, STEP_INFO, newActivity, type Activity, type StepKey, type StepStatus} from '@/lib/activity';
import {db, schema} from '@/lib/db';

// Writes the live processing log (project.activity). Updates for one project are applied one at a time
// in this process, so parallel work (e.g. several B-roll clips) never overwrites another update.

const queues = new Map<string, Promise<unknown>>();

function mutate(projectId: string, fn: (a: Activity) => void): Promise<void> {
	const prev = queues.get(projectId) ?? Promise.resolve();
	const next = prev
		.catch(() => undefined)
		.then(async () => {
			const [row] = await db.select({a: schema.project.activity, variantId: schema.project.variantId}).from(schema.project).where(eq(schema.project.id, projectId));
			if (!row) return;
			const a: Activity = row.a?.steps?.length ? row.a : newActivity({broll: row.variantId !== 'kit-student'});
			fn(a);
			await db.update(schema.project).set({activity: a}).where(eq(schema.project.id, projectId));
		})
		.catch((e) => console.error('activity update failed', e));
	queues.set(projectId, next);
	void next.finally(() => {
		if (queues.get(projectId) === next) queues.delete(projectId);
	});
	return next;
}

function step(a: Activity, key: StepKey) {
	let s = a.steps.find((x) => x.key === key);
	if (!s) {
		s = {key, ...STEP_INFO[key], status: 'pending', events: []};
		a.steps.push(s);
	}
	return s;
}

const push = (s: Activity['steps'][number], msg: string) => {
	s.events.push({t: Date.now(), msg: msg.slice(0, 300)});
	if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
};

const say = (projectId: string, key: StepKey, msg: string) => console.log(`[${projectId.slice(0, 8)}] ${STEP_INFO[key].label}: ${msg}`);

// One handle per step. Every call also prints to the terminal, so `npm run local` shows the automation too.
export function track(projectId: string) {
	const set = (key: StepKey, status: StepStatus, detail: string | undefined, msg?: string, extra: (s: ReturnType<typeof step>) => void = () => undefined) => {
		if (msg) say(projectId, key, msg);
		return mutate(projectId, (a) => {
			const s = step(a, key);
			s.status = status;
			if (detail !== undefined) s.detail = detail;
			if (msg) push(s, msg);
			extra(s);
		});
	};
	return {
		reset: (opts: {broll: boolean}) => mutate(projectId, (a) => Object.assign(a, newActivity(opts))),
		start: (key: StepKey, msg: string, who?: string) =>
			set(key, 'running', msg, msg, (s) => {
				s.startedAt = Date.now();
				s.endedAt = undefined;
				s.progress = undefined;
				if (who) s.who = who;
			}),
		log: (key: StepKey, msg: string, progress?: number) =>
			set(key, 'running', msg, msg, (s) => {
				s.startedAt ??= Date.now();
				if (progress !== undefined) s.progress = Math.max(0, Math.min(1, progress));
			}),
		done: (key: StepKey, detail: string) =>
			set(key, 'done', detail, `Done: ${detail}`, (s) => {
				s.endedAt = Date.now();
				s.startedAt ??= s.endedAt;
				s.progress = 1;
			}),
		wait: (key: StepKey, detail: string) => set(key, 'waiting', detail, detail, (s) => (s.startedAt = Date.now())),
		skip: (key: StepKey, detail: string) => set(key, 'skipped', detail),
		fail: (key: StepKey, detail: string) => set(key, 'failed', detail, `Failed: ${detail}`, (s) => (s.endedAt = Date.now())),
		// marks whichever step is running as failed (used by the pipeline's catch-all)
		failRunning: (detail: string) =>
			mutate(projectId, (a) => {
				const s = a.steps.find((x) => x.status === 'running');
				if (!s) return;
				say(projectId, s.key, `Failed: ${detail}`);
				s.status = 'failed';
				s.detail = detail;
				s.endedAt = Date.now();
				push(s, `Failed: ${detail}`);
			}),
		// back to pending (re-plan, re-render)
		pending: (keys: StepKey[]) =>
			mutate(projectId, (a) => {
				for (const k of keys) {
					const s = step(a, k);
					if (s.status === 'skipped') continue;
					Object.assign(s, {status: 'pending', detail: undefined, progress: undefined, startedAt: undefined, endedAt: undefined, events: []});
				}
			}),
	};
}

export type Tracker = ReturnType<typeof track>;
