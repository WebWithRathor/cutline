import path from 'node:path';
import {handleUpload, type HandleUploadBody} from '@vercel/blob/client';
import {getSession} from '@/lib/auth';
import {getOwnedProject} from '@/lib/projects';
import {storageMode, writeLocal} from '@/server/storage';

const MAX_VIDEO = 2 * 1024 * 1024 * 1024; // 2 GB
const MAX_AUDIO = 200 * 1024 * 1024;
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm', 'video/x-matroska'];

async function owned(ctx: RouteContext<'/api/projects/[id]/upload'>) {
	const session = await getSession();
	if (!session) return {error: Response.json({error: 'Sign in first.'}, {status: 401})};
	const {id} = await ctx.params;
	const project = await getOwnedProject(session.user.id, id);
	if (!project) return {error: Response.json({error: 'Project not found.'}, {status: 404})};
	if (project.sourceKey) return {error: Response.json({error: 'This project already has a video.'}, {status: 409})};
	return {project};
}

// Production: the browser uploads straight to Vercel Blob; this hands out a scoped client token.
export async function POST(request: Request, ctx: RouteContext<'/api/projects/[id]/upload'>) {
	if (storageMode !== 'blob') return Response.json({error: 'Blob storage is not configured.'}, {status: 400});
	const body = (await request.json()) as HandleUploadBody;
	// the completion callback comes from Vercel (no session) and needs no action here
	if (body.type === 'blob.upload-completed') return Response.json(await handleUpload({body, request, onBeforeGenerateToken: async () => ({}), onUploadCompleted: async () => undefined}));
	const o = await owned(ctx);
	if (o.error) return o.error;
	const id = o.project.id;
	try {
		const result = await handleUpload({
			body,
			request,
			onBeforeGenerateToken: async (pathname) => {
				const isAudio = pathname === `projects/${id}/audio.wav`;
				const isVideo = pathname.startsWith(`projects/${id}/source`) && VIDEO_EXT.has(path.extname(pathname).toLowerCase());
				if (!isAudio && !isVideo) throw new Error('Unexpected upload path.');
				return {
					allowedContentTypes: isAudio ? ['audio/wav', 'audio/x-wav'] : VIDEO_TYPES,
					maximumSizeInBytes: isAudio ? MAX_AUDIO : MAX_VIDEO,
					addRandomSuffix: true,
				};
			},
			onUploadCompleted: async () => undefined,
		});
		return Response.json(result);
	} catch (e) {
		return Response.json({error: e instanceof Error ? e.message : 'Upload refused.'}, {status: 400});
	}
}

// Development: PUT the file as the request body (?kind=source|audio), stored on local disk.
export async function PUT(request: Request, ctx: RouteContext<'/api/projects/[id]/upload'>) {
	if (storageMode !== 'local') return Response.json({error: 'Use direct uploads.'}, {status: 400});
	const o = await owned(ctx);
	if (o.error) return o.error;
	const kind = new URL(request.url).searchParams.get('kind');
	const name = decodeURIComponent(request.headers.get('x-file-name') ?? 'video.mp4');
	const ext = kind === 'audio' ? '.wav' : path.extname(name).toLowerCase() || '.mp4';
	if (kind !== 'audio' && !VIDEO_EXT.has(ext)) return Response.json({error: 'Upload an MP4, MOV, M4V, WebM or MKV file.'}, {status: 415});
	if (!request.body) return Response.json({error: 'No file received.'}, {status: 400});
	const key = `projects/${o.project.id}/${kind === 'audio' ? 'audio' : 'source'}${ext}`;
	try {
		await writeLocal(key, request.body, kind === 'audio' ? MAX_AUDIO : MAX_VIDEO);
	} catch (e) {
		return Response.json({error: e instanceof Error && e.message === 'File too large' ? 'That file is too large.' : 'Upload failed. Try again.'}, {status: 400});
	}
	return Response.json({key});
}
