import {createHmac, timingSafeEqual} from 'node:crypto';
import {createReadStream, createWriteStream} from 'node:fs';
import {mkdir, readFile, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client} from '@aws-sdk/client-s3';
import {getSignedUrl as signCloudFront} from '@aws-sdk/cloudfront-signer';
import {getSignedUrl as presignS3} from '@aws-sdk/s3-request-presigner';

// Files live in a private S3 bucket (reads through CloudFront signed URLs) when S3_BUCKET is set,
// and on local disk otherwise (development). Keys look like `projects/<id>/source.mp4`.
export const storageMode: 's3' | 'local' = process.env.S3_BUCKET ? 's3' : 'local';

const BUCKET = process.env.S3_BUCKET ?? '';
// Vercel reserves AWS_* names, so credentials use S3_* (falling back to the Remotion Lambda ones).
const region = process.env.S3_REGION || process.env.REMOTION_AWS_REGION || 'us-east-1';
let client: S3Client | null = null;
function s3() {
	client ??= new S3Client({
		region,
		// optional: S3-compatible endpoints (MinIO, R2, a local mock)
		...(process.env.S3_ENDPOINT ? {endpoint: process.env.S3_ENDPOINT, forcePathStyle: true} : {}),
		credentials:
			process.env.S3_ACCESS_KEY_ID || process.env.REMOTION_AWS_ACCESS_KEY_ID
				? {
						accessKeyId: (process.env.S3_ACCESS_KEY_ID || process.env.REMOTION_AWS_ACCESS_KEY_ID)!,
						secretAccessKey: (process.env.S3_SECRET_ACCESS_KEY || process.env.REMOTION_AWS_SECRET_ACCESS_KEY)!,
					}
				: undefined,
	});
	return client;
}
export const s3Bucket = () => BUCKET;
export const s3Region = () => region;

const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? './storage');

export function localPath(key: string) {
	const p = path.resolve(ROOT, key);
	if (!p.startsWith(ROOT + path.sep)) throw new Error('Invalid storage key');
	return p;
}

// ---------- uploads ----------

// S3: a presigned PUT the browser uploads to directly (single PUT supports up to 5 GB).
export async function presignedUpload(key: string, contentType: string, maxBytes: number) {
	const cmd = new PutObjectCommand({Bucket: BUCKET, Key: key, ContentType: contentType});
	const url = await presignS3(s3(), cmd, {expiresIn: 60 * 60, signableHeaders: new Set(['content-type'])});
	return {url, headers: {'Content-Type': contentType}, maxBytes};
}

// Local: write a request body to disk.
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

// Stores a finished file (used by the local render worker).
export async function putFile(key: string, filePath: string, contentType: string) {
	if (storageMode === 'local') {
		if (path.resolve(filePath) === localPath(key)) return;
		await mkdir(path.dirname(localPath(key)), {recursive: true});
		await pipeline(createReadStream(filePath), createWriteStream(localPath(key)));
		return;
	}
	const {size} = await stat(filePath);
	await s3().send(new PutObjectCommand({Bucket: BUCKET, Key: key, Body: createReadStream(filePath), ContentType: contentType, ContentLength: size}));
}

// ---------- both modes ----------

export async function sizeOf(key: string): Promise<number | null> {
	try {
		if (storageMode === 's3') return (await s3().send(new HeadObjectCommand({Bucket: BUCKET, Key: key}))).ContentLength ?? 0;
		return (await stat(localPath(key))).size;
	} catch {
		return null;
	}
}

export async function readBytes(key: string): Promise<Buffer> {
	if (storageMode === 'local') return readFile(localPath(key));
	const res = await s3().send(new GetObjectCommand({Bucket: BUCKET, Key: key}));
	return Buffer.from(await res.Body!.transformToByteArray());
}

export async function removePrefix(prefix: string) {
	if (storageMode === 'local') return rm(localPath(prefix), {recursive: true, force: true});
	let token: string | undefined;
	do {
		const page = await s3().send(new ListObjectsV2Command({Bucket: BUCKET, Prefix: prefix.endsWith('/') ? prefix : `${prefix}/`, ContinuationToken: token}));
		const keys = (page.Contents ?? []).map((o) => ({Key: o.Key!}));
		if (keys.length) await s3().send(new DeleteObjectsCommand({Bucket: BUCKET, Delete: {Objects: keys, Quiet: true}}));
		token = page.IsTruncated ? page.NextContinuationToken : undefined;
	} while (token);
}

export async function removeKey(key: string) {
	if (storageMode === 'local') return rm(localPath(key), {force: true});
	await s3()
		.send(new DeleteObjectCommand({Bucket: BUCKET, Key: key}))
		.catch(() => undefined);
}

// A short-lived URL anyone holding it can GET: CloudFront signed URL when configured, else an S3 presigned GET.
async function signedGet(key: string, ttlSec: number, downloadName?: string) {
	const domain = process.env.CLOUDFRONT_DOMAIN;
	const keyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID;
	const privateKey = process.env.CLOUDFRONT_PRIVATE_KEY?.replace(/\\n/g, '\n');
	// downloads use S3 directly so the filename override (response-content-disposition) is always honored
	if (domain && keyPairId && privateKey && !downloadName) {
		return signCloudFront({
			url: `https://${domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`,
			keyPairId,
			privateKey,
			dateLessThan: new Date(Date.now() + ttlSec * 1000).toISOString(),
		});
	}
	const cmd = new GetObjectCommand({Bucket: BUCKET, Key: key, ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName}"` : undefined});
	return presignS3(s3(), cmd, {expiresIn: Math.min(ttlSec, 7 * 24 * 3600)});
}

// A URL a third party (renderer, transcription API) can fetch for a while without a user session.
export async function mediaUrl(key: string, ttlSec = 60 * 60 * 6) {
	if (storageMode === 's3') return signedGet(key, ttlSec);
	const exp = Math.floor(Date.now() / 1000) + ttlSec;
	return `${appUrl()}/api/files/signed?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sign(key, exp)}`;
}

export function appUrl() {
	if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
	if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
	if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
	return 'http://localhost:3000';
}

// Serves a stored file to a signed-in user. S3: redirect to a short-lived signed URL. Local: stream with Range support.
export async function serveFile(key: string, request: Request, contentType: string, downloadName?: string) {
	if (storageMode === 's3') return Response.redirect(await signedGet(key, 60 * 60, downloadName), 302);
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
