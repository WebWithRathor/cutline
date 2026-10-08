import {createHmac, timingSafeEqual} from 'node:crypto';
import {createReadStream, createWriteStream} from 'node:fs';
import {mkdir, readFile, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {del, head, issueSignedToken, list, presignUrl} from '@vercel/blob';

// Files live on local disk in development and in Vercel Blob (private) when BLOB_READ_WRITE_TOKEN is set.
// Keys are paths like `projects/<id>/source.mp4` (for Blob: the blob pathname).
export const storageMode: 'blob' | 'local' = process.env.BLOB_READ_WRITE_TOKEN ? 'blob' : 'local';

const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? './storage');

export function localPath(key: string) {
	const p = path.resolve(ROOT, key);
	if (!p.startsWith(ROOT + path.sep)) throw new Error('Invalid storage key');
	return p;
}

// ---------- local-only helpers (dev uploads, local worker) ----------

export async function writeLocal(key: string, body: ReadableStream<Uint8Array>, maxBytes: number) {
	const p = localPath(key);
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
}

// ---------- both modes ----------

export async function exists(key: string) {
	try {
		if (storageMode === 'blob') await head(key);
		else await stat(localPath(key));
		return true;
	} catch {
		return false;
	}
}

export async function readBytes(key: string): Promise<Buffer> {
	if (storageMode === 'local') return readFile(localPath(key));
	const res = await fetch(await presignedGet(key, 600));
	if (!res.ok) throw new Error(`Could not read ${key} (${res.status})`);
	return Buffer.from(await res.arrayBuffer());
}

export async function removePrefix(prefix: string) {
	if (storageMode === 'local') return rm(localPath(prefix), {recursive: true, force: true});
	let cursor: string | undefined;
	do {
		const page = await list({prefix: prefix.endsWith('/') ? prefix : `${prefix}/`, cursor});
		if (page.blobs.length) await del(page.blobs.map((b) => b.url));
		cursor = page.hasMore ? page.cursor : undefined;
	} while (cursor);
}

export async function removeKey(key: string) {
	if (storageMode === 'local') return rm(localPath(key), {force: true});
	await del(key).catch(() => undefined);
}

async function presignedGet(key: string, ttlSec: number) {
	const validUntil = Date.now() + ttlSec * 1000;
	const pathname = key.startsWith('http') ? new URL(key).pathname.slice(1) : key;
	const token = await issueSignedToken({pathname, operations: ['get'], validUntil});
	const {presignedUrl} = await presignUrl(token, {operation: 'get', pathname, access: 'private', validUntil});
	return presignedUrl;
}

// A URL a third party (renderer, transcription API) can fetch for a while without a user session.
export async function mediaUrl(key: string, ttlSec = 60 * 60 * 3) {
	if (storageMode === 'blob') return presignedGet(key, ttlSec);
	const exp = Math.floor(Date.now() / 1000) + ttlSec;
	return `${appUrl()}/api/files/signed?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sign(key, exp)}`;
}

export function appUrl() {
	if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
	if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
	if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
	return 'http://localhost:3000';
}

// Serves a stored file to a signed-in user. Blob: redirect to a short-lived presigned URL. Local: stream with Range support.
export async function serveFile(key: string, request: Request, contentType: string, downloadName?: string) {
	if (storageMode === 'blob') return Response.redirect(await presignedGet(key, 60 * 30), 302);
	return localFileResponse(key, request, contentType, downloadName);
}

// ---------- local signed URLs (the dev renderer fetches media through these) ----------

function sign(key: string, exp: number) {
	const secret = process.env.FILE_URL_SECRET;
	if (!secret) throw new Error('FILE_URL_SECRET is not set');
	return createHmac('sha256', secret).update(`${key}:${exp}`).digest('base64url');
}

export function verifySignedFile(key: string, exp: string, sig: string) {
	const e = Number(exp);
	if (!Number.isFinite(e) || e < Date.now() / 1000) return false;
	const expected = Buffer.from(sign(key, e));
	const got = Buffer.from(sig);
	return expected.length === got.length && timingSafeEqual(expected, got);
}

export async function localFileResponse(key: string, request: Request, contentType: string, downloadName?: string) {
	let size: number;
	try {
		size = (await stat(localPath(key))).size;
	} catch {
		return new Response('Not found', {status: 404});
	}
	const headers: Record<string, string> = {'Content-Type': contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600'};
	if (downloadName) headers['Content-Disposition'] = `attachment; filename="${downloadName.replace(/"/g, '')}"`;
	const m = request.headers.get('range')?.match(/bytes=(\d*)-(\d*)/);
	if (m && (m[1] || m[2])) {
		const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
		const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
		if (start >= size || start > end) return new Response(null, {status: 416, headers: {'Content-Range': `bytes */${size}`}});
		headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
		headers['Content-Length'] = String(end - start + 1);
		return new Response(Readable.toWeb(createReadStream(localPath(key), {start, end})) as ReadableStream, {status: 206, headers});
	}
	headers['Content-Length'] = String(size);
	return new Response(Readable.toWeb(createReadStream(localPath(key))) as ReadableStream, {status: 200, headers});
}
