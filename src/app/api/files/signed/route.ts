import {fileResponse, verifySignedFile} from '@/lib/storage';

// Media access for the render worker via short-lived HMAC-signed URLs (no user session involved).
export async function GET(request: Request) {
	const u = new URL(request.url);
	const key = u.searchParams.get('key') ?? '';
	if (!verifySignedFile(key, u.searchParams.get('exp') ?? '', u.searchParams.get('sig') ?? '')) {
		return new Response('Forbidden', {status: 403});
	}
	return fileResponse(key, request, 'video/mp4');
}
