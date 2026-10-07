import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

export type Probe = {durationSec: number; width: number; height: number; hasAudio: boolean};

// Display size accounts for phone rotation metadata (a portrait iPhone clip is stored landscape + rotated).
export async function probe(file: string): Promise<Probe> {
	const {stdout} = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], {maxBuffer: 10 * 1024 * 1024});
	const j = JSON.parse(stdout) as {
		format?: {duration?: string};
		streams?: {codec_type: string; width?: number; height?: number; duration?: string; tags?: {rotate?: string}; side_data_list?: {rotation?: number}[]}[];
	};
	const v = j.streams?.find((s) => s.codec_type === 'video');
	if (!v?.width || !v.height) throw new Error('This file has no video track we can read.');
	const rot = Math.abs(Number(v.tags?.rotate ?? v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0)) % 180;
	const durationSec = Number(j.format?.duration ?? v.duration ?? 0);
	if (!durationSec) throw new Error('Could not read the video length.');
	return {
		durationSec,
		width: rot === 90 ? v.height : v.width,
		height: rot === 90 ? v.width : v.height,
		hasAudio: Boolean(j.streams?.some((s) => s.codec_type === 'audio')),
	};
}

// Small mono MP3 for transcription APIs (keeps uploads well under provider size limits).
export async function extractAudio(input: string, output: string) {
	await run(FFMPEG, ['-y', '-v', 'error', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', output], {maxBuffer: 10 * 1024 * 1024});
}
