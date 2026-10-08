import {spawn} from 'node:child_process';
import {createWriteStream, existsSync} from 'node:fs';
import {access, mkdir, readFile, rename, rm, stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import type {Word} from '@/remotion/types';
import {ProviderError} from './errors';

export {ProviderError};

// ---------- Transcription: Whisper on this machine (whisper.cpp) ----------
// Free and private: the audio never leaves the Mac. Install once with `brew install whisper-cpp`;
// the model is downloaded on first use into ~/.cache/cutline/whisper.

export type Report = (message: string, fraction?: number) => void;

const MODEL = process.env.WHISPER_MODEL || 'large-v3-turbo';
const MODEL_URL = (name: string) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${name}.bin`;
const CANDIDATES = ['whisper-cli', 'whisper-cpp', 'whisper'];
const BREW_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/home/linuxbrew/.linuxbrew/bin'];

export const INSTALL_HINT = 'Install Whisper once with `brew install whisper-cpp` (and FFmpeg: `brew install ffmpeg`), then try again.';

async function isExecutable(p: string) {
	try {
		await access(p, 1);
		return (await stat(p)).isFile();
	} catch {
		return false;
	}
}

// WHISPER_CPP_BIN, or whisper-cli on PATH / in Homebrew's bin folders.
export async function findWhisper(): Promise<string | null> {
	if (process.env.WHISPER_CPP_BIN) return (await isExecutable(process.env.WHISPER_CPP_BIN)) ? process.env.WHISPER_CPP_BIN : null;
	const dirs = [...(process.env.PATH ?? '').split(path.delimiter), ...BREW_DIRS].filter(Boolean);
	for (const name of CANDIDATES) for (const dir of dirs) if (await isExecutable(path.join(dir, name))) return path.join(dir, name);
	return null;
}

export const modelPath = () => process.env.WHISPER_MODEL_PATH || path.join(os.homedir(), '.cache', 'cutline', 'whisper', `ggml-${MODEL}.bin`);

// Downloads the model once (about 1.6 GB for large-v3-turbo), reporting progress.
export async function ensureModel(report: Report): Promise<string> {
	const file = modelPath();
	if (existsSync(file)) return file;
	if (process.env.WHISPER_MODEL_PATH) throw new ProviderError(`The Whisper model file ${file} does not exist.`);
	await mkdir(path.dirname(file), {recursive: true});
	report(`Downloading the Whisper ${MODEL} model (first run only)`, 0);
	const res = await fetch(MODEL_URL(MODEL));
	if (!res.ok || !res.body) throw new ProviderError(`Could not download the Whisper model (${res.status}). Check your internet connection, or set WHISPER_MODEL_PATH to a downloaded ggml model.`);
	const total = Number(res.headers.get('content-length')) || 0;
	let got = 0;
	let lastPct = -1;
	const part = `${file}.part`;
	const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream).on('data', (c: Buffer) => {
		got += c.length;
		const pct = total ? Math.floor((got / total) * 100) : -1;
		if (pct >= lastPct + 5) {
			lastPct = pct;
			report(`Downloading the Whisper model: ${pct}% of ${(total / 1e9).toFixed(1)} GB`, pct / 100);
		}
	});
	await pipeline(body, createWriteStream(part));
	await rename(part, file);
	report('Whisper model downloaded', 1);
	return file;
}

function run(cmd: string, args: string[], onLine: (line: string) => void, timeoutMs: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {stdio: ['ignore', 'pipe', 'pipe']});
		let tail = '';
		let buf = '';
		const feed = (d: Buffer) => {
			const s = d.toString();
			tail = (tail + s).slice(-3000);
			buf += s;
			const lines = buf.split(/\r?\n|\r/);
			buf = lines.pop() ?? '';
			lines.forEach(onLine);
		};
		child.stdout.on('data', feed);
		child.stderr.on('data', feed);
		const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
		child.on('error', (e) => {
			clearTimeout(timer);
			reject(e);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			if (code === 0) resolve();
			else reject(new Error(`${path.basename(cmd)} exited with ${code}: ${tail.slice(-1200)}`));
		});
	});
}

// 16 kHz mono 16-bit WAV, which whisper.cpp needs. `input` is a local path or a URL ffmpeg can read.
export async function extractAudio(input: string, out: string) {
	try {
		await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', out], () => undefined, 20 * 60 * 1000);
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new ProviderError(`FFmpeg is not installed. ${INSTALL_HINT}`);
		throw new ProviderError('Could not read the audio from this video.');
	}
}

type Token = {text?: string; offsets?: {from?: number; to?: number}};
type WhisperJson = {result?: {language?: string}; transcription?: {offsets?: {from?: number; to?: number}; text?: string; tokens?: Token[]}[]};

// whisper.cpp's full JSON has per-token times (ms). A token starting with a space begins a new word;
// other tokens (word pieces, punctuation) join the word before. Special tokens ([_BEG_], [_TT_…], <|…|>) are skipped.
export function wordsFromWhisper(json: WhisperJson): Word[] {
	const out: Word[] = [];
	for (const seg of json.transcription ?? []) {
		let fresh = true;
		for (const t of seg.tokens ?? []) {
			const text = t.text ?? '';
			if (!text || /^\s*(\[_|<\|)/.test(text)) continue;
			const from = Number(t.offsets?.from);
			const to = Number(t.offsets?.to);
			if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
			const last = out[out.length - 1];
			const startsWord = fresh || /^\s/.test(text);
			const trimmed = text.trim();
			if (!trimmed) continue;
			// punctuation on its own ("," "?" "—") belongs to the previous word
			if (startsWord && !/[\p{L}\p{N}]/u.test(trimmed) && last) {
				last.text += trimmed;
				last.endMs = Math.max(last.endMs, to);
			} else if (startsWord || !last) {
				out.push({text: trimmed, startMs: from, endMs: Math.max(from + 60, to)});
			} else {
				last.text += text;
				last.endMs = Math.max(last.endMs, to);
			}
			fresh = false;
		}
	}
	// keep times increasing and non-overlapping
	for (let i = 1; i < out.length; i++) {
		if (out[i].startMs < out[i - 1].startMs) out[i].startMs = out[i - 1].startMs;
		if (out[i - 1].endMs > out[i].startMs) out[i - 1].endMs = Math.max(out[i - 1].startMs + 40, out[i].startMs);
	}
	return out.filter((w) => w.text);
}

// Transcribes a 16 kHz WAV (or anything ffmpeg can read: it is converted first).
export async function transcribeWhisper(opts: {input: string; isWav: boolean; durationSec: number; report: Report}): Promise<{words: Word[]; language: string; model: string; binary: string}> {
	const bin = await findWhisper();
	if (!bin) throw new ProviderError(`Whisper is not installed on this computer. ${INSTALL_HINT}`);
	const model = await ensureModel(opts.report);
	const dir = path.join(os.tmpdir(), 'cutline-whisper', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
	await mkdir(dir, {recursive: true});
	try {
		let wav = opts.input;
		if (!opts.isWav) {
			opts.report('Extracting the audio with FFmpeg', 0);
			wav = path.join(dir, 'audio.wav');
			await extractAudio(opts.input, wav);
		}
		const base = path.join(dir, 'out');
		const threads = Math.max(2, Math.min(8, os.cpus().length - 1));
		opts.report(`Whisper ${MODEL} is listening (${threads} threads)`, 0);
		let lastPct = -1;
		await run(
			bin,
			['-m', model, '-f', wav, '-l', process.env.WHISPER_LANGUAGE || 'auto', '-t', String(threads), '-ojf', '-of', base, '-pp'],
			(line) => {
				const m = /progress\s*=\s*(\d+)%/.exec(line);
				if (!m) return;
				const pct = Number(m[1]);
				if (pct >= lastPct + 10 || pct === 100) {
					lastPct = pct;
					opts.report(`Transcribing: ${pct}%`, pct / 100);
				}
			},
			// about 10x real time is slow even on an old Intel Mac
			Math.max(10 * 60 * 1000, opts.durationSec * 10 * 1000),
		).catch((e) => {
			if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new ProviderError(`Whisper is not installed on this computer. ${INSTALL_HINT}`);
			console.error('whisper failed', e);
			throw new ProviderError('Whisper could not transcribe this audio. Try again, or check the terminal for details.');
		});
		const json = JSON.parse(await readFile(`${base}.json`, 'utf8')) as WhisperJson;
		return {words: wordsFromWhisper(json), language: json.result?.language ?? 'unknown', model: MODEL, binary: bin};
	} finally {
		await rm(dir, {recursive: true, force: true});
	}
}
