import {createHmac, timingSafeEqual} from 'node:crypto';
import {createReadStream, createWriteStream} from 'node:fs';
import {mkdir, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

// Local-disk storage behind a small interface; swap for S3 / R2 later without touching callers.
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? './storage');

function resolveKey(key: string) {
	const p = path.resolve(ROOT, key);
	if (!p.startsWith(ROOT + path.sep)) throw new Error('Invalid storage key');
	return p;
}

export const storage = {
	path: resolveKey,

	async write(key: string, body: ReadableStream<Uint8Array>, maxBytes: number) {
		const p = resolveKey(key);
		await mkdir(path.dirname(p), {recursive: true});
		let total = 0;
		const limited = Readable.fromWeb(body as import('node:stream/web').ReadableStream).on('data', (chunk: Buffer) => {
			total += chunk.length;
			if (total > maxBytes) limited.destroy(new Error('File too large'));
		});
		try {
			await pipeline(limited, createWriteStream(p));
		} catch (e) {
			await rm(p, {force: true});
			throw e;
		}
		return total;
	},

	async size(key: string) {
		return (await stat(resolveKey(key))).size;
	},

	read(key: string, range?: {start: number; end: number}) {
		return createReadStream(resolveKey(key), range);
	},

	async removePrefix(prefix: string) {
		await rm(resolveKey(prefix), {recursive: true, force: true});
	},
};

// ---------- short-lived signed URLs (used by the renderer, which has no user session) ----------

function sign(key: string, exp: number) {
	const secret = process.env.FILE_URL_SECRET;
	if (!secret) throw new Error('FILE_URL_SECRET is not set');
	return createHmac('sha256', secret).update(`${key}:${exp}`).digest('base64url');
}

export function signedFileUrl(key: string, ttlSec = 60 * 60 * 2) {
	const exp = Math.floor(Date.now() / 1000) + ttlSec;
	const base = process.env.APP_URL ?? 'http://localhost:3000';
	return `${base}/api/files/signed?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sign(key, exp)}`;
}

export function verifySignedFile(key: string, exp: string, sig: string) {
	const e = Number(exp);
	if (!Number.isFinite(e) || e < Date.now() / 1000) return false;
	const expected = Buffer.from(sign(key, e));
	const got = Buffer.from(sig);
	return expected.length === got.length && timingSafeEqual(expected, got);
}

// Serves a stored file with HTTP Range support (needed for video seeking).
export async function fileResponse(key: string, request: Request, contentType: string, downloadName?: string) {
	let size: number;
	try {
		size = await storage.size(key);
	} catch {
		return new Response('Not found', {status: 404});
	}
	const headers: Record<string, string> = {
		'Content-Type': contentType,
		'Accept-Ranges': 'bytes',
		'Cache-Control': 'private, max-age=3600',
	};
	if (downloadName) headers['Content-Disposition'] = `attachment; filename="${downloadName.replace(/"/g, '')}"`;
	const range = request.headers.get('range');
	const m = range?.match(/bytes=(\d*)-(\d*)/);
	if (m && (m[1] || m[2])) {
		const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
		const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
		if (start >= size || start > end) return new Response(null, {status: 416, headers: {'Content-Range': `bytes */${size}`}});
		headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
		headers['Content-Length'] = String(end - start + 1);
		return new Response(Readable.toWeb(storage.read(key, {start, end})) as ReadableStream, {status: 206, headers});
	}
	headers['Content-Length'] = String(size);
	return new Response(Readable.toWeb(storage.read(key)) as ReadableStream, {status: 200, headers});
}
