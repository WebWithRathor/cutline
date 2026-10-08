'use client';

import {upload} from '@vercel/blob/client';

export type VideoInfo = {durationSec: number; width: number; height: number};

// Reads duration and display size (rotation applied) without uploading anything.
// MP4/MOV/M4V are parsed from the container, so it works even when the browser can't decode the codec (e.g. HEVC).
export async function probeVideo(file: File): Promise<VideoInfo> {
	if (/\.(mp4|mov|m4v)$/i.test(file.name) || /mp4|quicktime|m4v/.test(file.type)) {
		const fromContainer = await probeMp4(file).catch(() => null);
		if (fromContainer) return fromContainer;
	}
	return probeWithVideoElement(file);
}

async function probeMp4(file: File): Promise<VideoInfo | null> {
	const MP4Box = await import('mp4box');
	const mp4 = MP4Box.createFile();
	let info: import('mp4box').MP4Info | null = null;
	let failed = false;
	mp4.onReady = (i) => (info = i);
	mp4.onError = () => (failed = true);
	let offset = 0;
	const CHUNK = 4 * 1024 * 1024;
	// appendBuffer returns the next byte it wants, so a moov box at the end of the file is found without reading everything
	while (!info && !failed && offset < file.size) {
		const buf = (await file.slice(offset, offset + CHUNK).arrayBuffer()) as import('mp4box').MP4ArrayBuffer;
		buf.fileStart = offset;
		const next = mp4.appendBuffer(buf);
		offset = next > offset ? next : offset + buf.byteLength;
	}
	mp4.flush();
	const i = info as import('mp4box').MP4Info | null;
	const v = i?.videoTracks[0];
	if (!i || !v || !i.timescale) return null;
	const m = v.matrix ?? [65536, 0, 0, 0, 65536, 0];
	const angle = Math.abs((Math.atan2(m[1], m[0]) * 180) / Math.PI) % 180;
	const rotated = Math.abs(angle - 90) < 1;
	return {durationSec: i.duration / i.timescale, width: rotated ? v.track_height : v.track_width, height: rotated ? v.track_width : v.track_height};
}

function probeWithVideoElement(file: File): Promise<VideoInfo> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const v = document.createElement('video');
		v.preload = 'metadata';
		v.muted = true;
		v.onloadedmetadata = () => {
			const info = {durationSec: v.duration, width: v.videoWidth, height: v.videoHeight};
			URL.revokeObjectURL(url);
			if (!Number.isFinite(info.durationSec) || !info.width) reject(new Error('This browser can’t read that video. Try an MP4.'));
			else resolve(info);
		};
		v.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('This browser can’t read that video. Try an MP4 or MOV.'));
		};
		v.src = url;
	});
}

// 16 kHz mono 16-bit WAV of the clip's audio, for transcription (~1.9 MB per minute).
// Returns null when the browser can't decode the file; the server then falls back to Deepgram reading the video.
export async function extractAudioWav(file: File, durationSec: number): Promise<Blob | null> {
	if (file.size > 900 * 1024 * 1024 || durationSec > 60 * 60) return null; // too big to decode in memory
	try {
		const rate = 16000;
		const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(durationSec * rate)), rate);
		const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
		const src = ctx.createBufferSource();
		src.buffer = decoded;
		src.connect(ctx.destination);
		src.start();
		const mono = (await ctx.startRendering()).getChannelData(0);
		return encodeWav(mono, rate);
	} catch {
		return null;
	}
}

function encodeWav(samples: Float32Array, rate: number) {
	const buf = new ArrayBuffer(44 + samples.length * 2);
	const v = new DataView(buf);
	const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
	str(0, 'RIFF');
	v.setUint32(4, 36 + samples.length * 2, true);
	str(8, 'WAVE');
	str(12, 'fmt ');
	v.setUint32(16, 16, true);
	v.setUint16(20, 1, true); // PCM
	v.setUint16(22, 1, true); // mono
	v.setUint32(24, rate, true);
	v.setUint32(28, rate * 2, true);
	v.setUint16(32, 2, true);
	v.setUint16(34, 16, true);
	str(36, 'data');
	v.setUint32(40, samples.length * 2, true);
	for (let i = 0; i < samples.length; i++) {
		const s = Math.max(-1, Math.min(1, samples[i]));
		v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
	}
	return new Blob([buf], {type: 'audio/wav'});
}

const ext = (name: string) => (name.match(/\.[a-z0-9]+$/i)?.[0] ?? '.mp4').toLowerCase();

// Uploads a file for a project and returns its storage key.
export async function uploadProjectFile(opts: {
	projectId: string;
	file: Blob;
	kind: 'source' | 'audio';
	fileName: string;
	storage: 'blob' | 'local';
	onProgress?: (p: number) => void;
}): Promise<string> {
	const {projectId, file, kind, fileName, storage, onProgress} = opts;
	if (storage === 'blob') {
		const pathname = `projects/${projectId}/${kind === 'audio' ? 'audio.wav' : `source${ext(fileName)}`}`;
		const res = await upload(pathname, file, {
			access: 'private',
			handleUploadUrl: `/api/projects/${projectId}/upload`,
			multipart: file.size > 50 * 1024 * 1024,
			contentType: kind === 'audio' ? 'audio/wav' : file.type || 'video/mp4',
			onUploadProgress: ({percentage}) => onProgress?.(percentage / 100),
		});
		return res.pathname;
	}
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('PUT', `/api/projects/${projectId}/upload?kind=${kind}`);
		xhr.setRequestHeader('x-file-name', encodeURIComponent(fileName));
		xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
		xhr.onload = () => {
			let body: {key?: string; error?: string} = {};
			try {
				body = JSON.parse(xhr.responseText);
			} catch {}
			if (xhr.status >= 200 && xhr.status < 300 && body.key) resolve(body.key);
			else reject(new Error(body.error ?? 'Upload failed. Try again.'));
		};
		xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
		xhr.send(file);
	});
}
