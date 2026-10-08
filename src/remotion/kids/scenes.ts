import type {KidsCharacter, KidsOverlay, KidsScene} from '../types';
import type {Kit} from './kit';

// A plan shot resolved onto the edited timeline (seconds). Word refs are already times.
export type ResolvedOverlay =
	| {type: 'hello'; at: number; text: string}
	| {type: 'count'; at: number; sign: string}
	| {type: 'stickers'; items: {at: number; until: number; label: string; color: string}[]}
	| {type: 'nextTime'; at: number; title: string; sub: string; guest?: KidsCharacter};

export type ResolvedScene =
	| {type: 'cast'; label?: string; actors: {character: KidsCharacter; mood?: string; arm?: string; at: number}[]; bubble?: {text: string; at: number; actor: number}; title?: {text: string; at: number}}
	| {type: 'doDont'; label: string; character: KidsCharacter; tOk: number; tBad: number}
	| {type: 'justRight'; label: string; character: KidsCharacter; tMuch: number; tLittle: number; tEnd: number};

export type ResolvedShot =
	| {kind: 'camera'; s: number; e: number; zoom: [number, number]; overlay?: ResolvedOverlay}
	| {kind: 'cutaway'; s: number; e: number; scene: ResolvedScene; v: number};

type Pose = {mood?: string; arm?: string; extra?: Record<string, unknown>};

// What each character looks like in each role. Moods/arms are the ones the kit draws.
const POSES: Record<KidsCharacter, {ok: Pose; bad: Pose; much: Pose; little: Pose; moods: string[]; arms: string[]}> = {
	kiko: {ok: {mood: 'cheer', arm: 'cheer'}, bad: {mood: 'gasp', arm: 'both'}, much: {mood: 'gasp', arm: 'both'}, little: {mood: 'think'}, moods: ['happy', 'talk', 'wow', 'think', 'gasp', 'cheer'], arms: ['rest', 'up', 'both', 'point', 'cheer']},
	sparky: {
		ok: {mood: 'cheer', arm: 'thumbs', extra: {on: 1}},
		bad: {mood: 'scared', arm: 'cover', extra: {on: 0.3}},
		much: {mood: 'hot', arm: 'cover', extra: {on: 1}},
		little: {mood: 'sleepy', extra: {on: 0.12}},
		moods: ['happy', 'cheer', 'scared', 'hot', 'sleepy', 'confused'],
		arms: ['rest', 'up', 'thumbs', 'cover'],
	},
	ohmie: {ok: {mood: 'cheer', arm: 'wave'}, bad: {mood: 'strict', arm: 'stop'}, much: {mood: 'strict', arm: 'stop'}, little: {mood: 'relaxed', arm: 'rest'}, moods: ['guard', 'happy', 'strict', 'relaxed', 'cheer'], arms: ['stop', 'wave', 'arms', 'rest']},
	zips: {ok: {mood: 'happy'}, bad: {mood: 'rush'}, much: {mood: 'rush', extra: {speed: 0.6}}, little: {mood: 'wait', extra: {speed: 0.03}}, moods: ['calm', 'rush', 'wait', 'happy'], arms: []},
	batt: {ok: {mood: 'proud', extra: {flex: 1}}, bad: {mood: 'oops'}, much: {mood: 'proud', extra: {flex: 1}}, little: {mood: 'oops'}, moods: ['proud', 'happy', 'oops'], arms: []},
	grandpaBulb: {ok: {mood: 'proud', extra: {heat: 0.6}}, bad: {mood: 'hot', extra: {heat: 1, fan: true}}, much: {mood: 'hot', extra: {heat: 1, fan: true}}, little: {mood: 'happy', extra: {heat: 0}}, moods: ['happy', 'hot', 'proud'], arms: []},
};

export const characterVocabulary = () =>
	(Object.keys(POSES) as KidsCharacter[]).map((c) => ({character: c, moods: POSES[c].moods, arms: POSES[c].arms}));

export function drawActor(k: Kit, who: KidsCharacter, x: number, y: number, sc: number, t: number, s: number, pose: Pose) {
	const known = POSES[who];
	const mood = pose.mood && known.moods.includes(pose.mood) ? pose.mood : undefined;
	const arm = pose.arm && known.arms.includes(pose.arm) ? pose.arm : undefined;
	const o: Record<string, unknown> = {t, s, ...(mood ? {mood} : {}), ...(arm ? {arm} : {}), ...pose.extra};
	switch (who) {
		case 'kiko':
			return k.kiko(x, y, sc, o);
		case 'sparky':
			return k.sparky(x, y, sc, {on: mood === 'sleepy' ? 0.12 : 0.8, ...o});
		case 'ohmie':
			return k.ohmie(x, y, sc, o);
		case 'batt':
			return k.batt(x, y, sc, o);
		case 'grandpaBulb':
			return k.grandpaBulb(x, y, sc, o);
		case 'zips': {
			if (s <= 0.01) return;
			const w = 280 * sc;
			return k.zipCrowd(x - w, y - 260 * sc, x + w, y - 260 * sc, 7, {mood: mood ?? 'calm', t, speed: (pose.extra?.speed as number) ?? 0.25, sc: 0.85 * sc * Math.min(1, s), spread: 40 * sc});
		}
	}
}

const COLORS: Record<string, keyof Kit['C']> = {lemon: 'lemon', mint: 'mint', pink: 'pink', sky: 'sky', lav: 'lav', coral: 'coral', gold: 'gold'};

export function drawCamera(k: Kit, o: ResolvedOverlay | undefined, t: number) {
	if (!o) return;
	switch (o.type) {
		case 'hello':
			return k.BEAT.hello(t, o.at, o.text);
		case 'count':
			return k.BEAT.count(t, o.at, o.sign);
		case 'stickers':
			return k.BEAT.stickers(
				t,
				o.items.slice(0, 3).map((it, i) => [it.at, it.until, it.label, k.C[COLORS[it.color] ?? 'lemon'], [330, 520, 710][i]]),
			);
		case 'nextTime':
			return k.BEAT.nextTime(t, o.at, o.title, o.sub, o.guest ? (tt, s) => drawActor(k, o.guest!, 1790, 1075, 0.42, tt, s, {mood: POSES[o.guest!].ok.mood, extra: POSES[o.guest!].ok.extra}) : undefined);
	}
}

const SLOTS: Record<number, {xs: number[]; sc: number}> = {1: {xs: [960], sc: 1.15}, 2: {xs: [640, 1290], sc: 1.0}, 3: {xs: [420, 960, 1500], sc: 0.85}};

export function drawCutaway(k: Kit, sc: ResolvedScene, t: number, s0: number, v: number) {
	switch (sc.type) {
		case 'cast': {
			k.paper(t, v);
			if (sc.label) k.tag(t, s0, sc.label);
			const actors = sc.actors.slice(0, 3);
			const slot = SLOTS[actors.length] ?? SLOTS[1];
			actors.forEach((a, i) => drawActor(k, a.character, slot.xs[i], 900, slot.sc, t, k.pop(t, Math.max(s0, a.at - 0.2)), {mood: a.mood, arm: a.arm}));
			if (sc.title) k.txt(sc.title.text, 960, sc.label ? 215 : 150, {size: 84, font: k.HAND, weight: 700, rot: -0.03, a: k.p(t, sc.title.at, sc.title.at + 0.25)});
			if (sc.bubble) {
				const x = slot.xs[Math.min(sc.bubble.actor, actors.length - 1)] ?? 960;
				const bx = Math.max(330, Math.min(1590, x + (x > 960 ? -200 : 200)));
				k.bubble(bx, 330, sc.bubble.text, {size: 48, tail: [x > 960 ? 120 : -120, 90], s: k.pop(t, sc.bubble.at)});
			}
			return;
		}
		case 'doDont':
			return k.BEAT.doDont(t, s0, sc.label, sc.tOk, sc.tBad, (tt, x, ok, s) => drawActor(k, sc.character, x, 900, 0.95, tt, s, ok ? POSES[sc.character].ok : POSES[sc.character].bad));
		case 'justRight':
			return k.BEAT.justRight(t, s0, sc.label, sc.tMuch, sc.tLittle, sc.tEnd, (tt, x, i, s) =>
				drawActor(k, sc.character, x, 760, 0.55, tt, s, i === 0 ? POSES[sc.character].much : i === 1 ? POSES[sc.character].ok : POSES[sc.character].little),
			);
	}
}

export type {KidsOverlay, KidsScene};
