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
