// Synthesizes the sound effects into public/sfx/*.wav (44.1 kHz mono). Deterministic, no samples, no licences.
// Run after changing a sound:  node scripts/make-sfx.mjs
import {mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const RATE = 44100;
const OUT = path.resolve('public/sfx');

let seed = 7;
const rand = () => {
	seed = (seed * 1664525 + 1013904223) >>> 0;
	return seed / 2 ** 32;
};
const noise = () => rand() * 2 - 1;

function render(seconds, fn) {
	const n = Math.round(seconds * RATE);
	const out = new Float32Array(n);
	const state = {};
	for (let i = 0; i < n; i++) out[i] = fn(i / RATE, i, state, seconds);
	return out;
}

const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));

// one-pole low-pass whose cutoff can move over time
const lowpass = (state, key, x, hz) => {
	const k = 1 - Math.exp((-2 * Math.PI * hz) / RATE);
	state[key] = (state[key] ?? 0) + k * (x - (state[key] ?? 0));
	return state[key];
};

const SOUNDS = {
	whoosh: render(0.65, (t, _i, s, d) => {
		const u = t / d;
		const cutoff = 300 + 5200 * Math.sin(Math.PI * u) ** 2;
		const band = lowpass(s, 'a', noise(), cutoff) - lowpass(s, 'b', noise() * 0.2, 180);
		return band * Math.sin(Math.PI * u) ** 1.5 * 1.6;
	}),
	pop: render(0.16, (t, _i, s) => {
		s.ph = (s.ph ?? 0) + (2 * Math.PI * (300 + 900 * Math.exp(-t / 0.018))) / RATE;
		return Math.sin(s.ph) * env(t, 0.002, 0.035) * 0.9;
	}),
	click: render(0.06, (t) => (noise() * 0.6 * Math.exp(-t / 0.002) + Math.sin(2 * Math.PI * 2100 * t) * 0.5 * Math.exp(-t / 0.008))),
	ding: render(1.4, (t) => (Math.sin(2 * Math.PI * 1318.5 * t) * 0.55 + Math.sin(2 * Math.PI * 2637 * t) * 0.18 + Math.sin(2 * Math.PI * 3951 * t) * 0.07) * env(t, 0.003, 0.38)),
	riser: render(1.5, (t, _i, s) => {
		const u = Math.min(1, t / 1.4);
		s.ph = (s.ph ?? 0) + (2 * Math.PI * (180 + 1100 * u * u)) / RATE;
		const tail = t > 1.4 ? Math.exp(-(t - 1.4) / 0.02) : 1;
		return (Math.sin(s.ph) * 0.35 + lowpass(s, 'n', noise(), 400 + 6000 * u) * 0.7) * u ** 2 * tail;
	}),
	impact: render(1.1, (t, _i, s) => {
		s.ph = (s.ph ?? 0) + (2 * Math.PI * (48 + 90 * Math.exp(-t / 0.05))) / RATE;
		const body = Math.sin(s.ph) * env(t, 0.002, 0.32);
		const crack = lowpass(s, 'n', noise(), 1800) * Math.exp(-t / 0.03);
		return Math.tanh((body * 1.3 + crack) * 1.4) * 0.9;
	}),
	glitch: render(0.38, (t, i, s) => {
		const seg = Math.floor(t / 0.032);
		if (s.seg !== seg) {
			s.seg = seg;
			s.f = 120 + rand() * 1400;
			s.on = rand() > 0.25;
		}
		if (!s.on) return 0;
		const sq = Math.sign(Math.sin(2 * Math.PI * s.f * t));
		const crushed = Math.round(noise() * 4) / 4;
		return (i % 3 === 0 ? sq * 0.35 : crushed * 0.3) * (1 - t / 0.38);
	}),
	swipe: render(0.28, (t, _i, s, d) => {
		const x = noise();
		const hp = x - lowpass(s, 'l', x, 1500 + 4000 * (t / d));
		return hp * Math.sin(Math.PI * (t / d)) * 0.9;
	}),
	// swells in and stops dead on the word (played 0.62 s early)
	'reverse-whoosh': render(0.66, (t, _i, s, d) => {
		const u = t / d;
		const cutoff = 300 + 6000 * u * u;
		const tail = u > 0.94 ? Math.exp(-(u - 0.94) * 120) : 1;
		return (lowpass(s, 'a', noise(), cutoff) - lowpass(s, 'b', noise() * 0.2, 160)) * u ** 2.2 * tail * 1.8;
	}),
	notification: render(0.75, (t) => {
		const note = (f, at) => (t < at ? 0 : (Math.sin(2 * Math.PI * f * (t - at)) * 0.6 + Math.sin(2 * Math.PI * f * 2 * (t - at)) * 0.15) * env(t - at, 0.004, 0.16));
		return note(880, 0) + note(1318.5, 0.13);
	}),
	// heavy sub hit with a short echo tail
	boom: render(1.8, (t, _i, s) => {
		s.ph = (s.ph ?? 0) + (2 * Math.PI * (42 + 80 * Math.exp(-t / 0.07))) / RATE;
		const hit = (tt) => (tt < 0 ? 0 : Math.exp(-tt / 0.55));
		const body = Math.sin(s.ph) * (hit(t) + 0.35 * hit(t - 0.21) + 0.12 * hit(t - 0.42));
		const thump = lowpass(s, 'n', noise(), 900) * Math.exp(-t / 0.025);
		return Math.tanh((body * 1.6 + thump * 1.2) * 1.8) * 0.95;
	}),
	'bass-drop': render(1.4, (t, _i, s) => {
		const f = 30 + 110 * Math.exp(-t / 0.35);
		s.ph = (s.ph ?? 0) + (2 * Math.PI * f) / RATE;
		return Math.tanh(Math.sin(s.ph) * 2.2) * env(t, 0.01, 0.7) * 0.9;
	}),
	shutter: render(0.22, (t, _i, s) => {
		const burst = (at, len) => (t >= at && t < at + len ? Math.exp(-(t - at) / (len / 4)) : 0);
		const n = noise();
		return (n - lowpass(s, 'l', n, 2500)) * (burst(0, 0.03) + 0.8 * burst(0.085, 0.045)) * 1.4;
	}),
	typing: render(0.8, (t, _i, s) => {
		s.next ??= 0;
		if (t >= s.next) {
			s.at = t;
			s.next = t + 0.06 + rand() * 0.07;
			s.f = 1800 + rand() * 1600;
		}
		const k = t - s.at;
		const n = noise();
		return ((n - lowpass(s, 'l', n, 1200)) * 0.7 + Math.sin(2 * Math.PI * s.f * k) * 0.3) * Math.exp(-k / 0.008);
	}),
	cash: render(1.1, (t, _i, s) => {
		const drawer = lowpass(s, 'd', noise(), 3000) * Math.exp(-t / 0.04) * 0.8;
		const at = 0.07;
		const k = t - at;
		const bell = k < 0 ? 0 : [2093, 2637, 3322, 4186].reduce((a, f, i) => a + Math.sin(2 * Math.PI * f * k * (1 + i * 0.003)) / (i + 1.5), 0) * env(k, 0.002, 0.3);
		return drawer + bell * 0.7;
	}),
	heartbeat: render(1.3, (t, _i, s) => {
		const thump = (at, g) => (t < at ? 0 : Math.sin(2 * Math.PI * 52 * (t - at)) * Math.exp(-(t - at) / 0.07) * g);
		const x = thump(0, 1) + thump(0.24, 0.7) + thump(0.78, 0.9) + thump(1.02, 0.6);
		return lowpass(s, 'l', x, 240) * 2.2;
	}),
	'record-scratch': render(0.55, (t, _i, s) => {
		const wobble = 0.5 + 0.5 * Math.sin(2 * Math.PI * (9 + 10 * t) * t);
		const band = lowpass(s, 'a', noise(), 400 + 2600 * wobble) - lowpass(s, 'b', noise(), 250);
		return band * (1 - t / 0.55) * 1.8;
	}),
	tick: render(0.62, (t) => {
		const tk = (at, f) => (t < at ? 0 : Math.sin(2 * Math.PI * f * (t - at)) * Math.exp(-(t - at) / 0.012));
		return tk(0, 2400) + tk(0.5, 1900);
	}),
	boing: render(0.7, (t, _i, s) => {
		const f = 160 + 180 * Math.exp(-t / 0.18) + 40 * Math.sin(2 * Math.PI * 16 * t) * Math.exp(-t / 0.3);
		s.ph = (s.ph ?? 0) + (2 * Math.PI * f) / RATE;
		return Math.sin(s.ph) * env(t, 0.005, 0.25) * 0.9;
	}),
	sparkle: render(1.0, (t, _i, s) => {
		s.notes ??= Array.from({length: 11}, (_, i) => ({at: i * 0.06 + rand() * 0.03, f: 2600 + rand() * 3400}));
		return s.notes.reduce((a, n) => a + (t < n.at ? 0 : Math.sin(2 * Math.PI * n.f * (t - n.at)) * Math.exp(-(t - n.at) / 0.12)), 0) * 0.35 * (1 - t);
	}),
};

function wav(samples) {
	let peak = 0;
	for (const v of samples) peak = Math.max(peak, Math.abs(v));
	const gain = peak > 0 ? 0.89 / peak : 1;
	const b = Buffer.alloc(44 + samples.length * 2);
	b.write('RIFF', 0, 'ascii');
	b.writeUInt32LE(36 + samples.length * 2, 4);
	b.write('WAVEfmt ', 8, 'ascii');
	b.writeUInt32LE(16, 16);
	b.writeUInt16LE(1, 20);
	b.writeUInt16LE(1, 22);
	b.writeUInt32LE(RATE, 24);
	b.writeUInt32LE(RATE * 2, 28);
	b.writeUInt16LE(2, 32);
	b.writeUInt16LE(16, 34);
	b.write('data', 36, 'ascii');
	b.writeUInt32LE(samples.length * 2, 40);
	samples.forEach((v, i) => {
		// 3 ms fade in/out so nothing clicks
		const edge = Math.min(1, i / 132, (samples.length - 1 - i) / 132);
		b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * gain * edge)) * 32767), 44 + i * 2);
	});
	return b;
}

mkdirSync(OUT, {recursive: true});
for (const [name, samples] of Object.entries(SOUNDS)) {
	writeFileSync(path.join(OUT, `${name}.wav`), wav(samples));
	console.log(`sfx/${name}.wav  ${(samples.length / RATE).toFixed(2)}s`);
}
