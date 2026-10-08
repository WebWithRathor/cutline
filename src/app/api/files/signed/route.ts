import {localFileResponse, storageMode, verifySignedFile} from '@/server/storage';

// Development media access for the local renderer via short-lived HMAC-signed URLs.
export async function GET(request: Request) {
	if (storageMode !== 'local') return new Response('Not found', {status: 404});
	const u = new URL(request.url);
	const key = u.searchParams.get('key') ?? '';
	if (!verifySignedFile(key, u.searchParams.get('exp') ?? '', u.searchParams.get('sig') ?? '')) return new Response('Forbidden', {status: 403});
	return localFileResponse(key, request, key.endsWith('.wav') ? 'audio/wav' : 'video/mp4');
}
