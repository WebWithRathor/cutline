import path from 'node:path';
import {z} from 'zod';
import {getSession} from '@/lib/auth';
import {getOwnedProject} from '@/lib/projects';
import {presignedUpload, storageMode, writeLocal} from '@/server/storage';

const MAX_VIDEO = 2 * 1024 * 1024 * 1024; // 2 GB
const MAX_AUDIO = 200 * 1024 * 1024;
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);
const VIDEO_TYPE: Record<string, string> = {'.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v', '.webm': 'video/webm', '.mkv': 'video/x-matroska'};

async function owned(ctx: RouteContext<'/api/projects/[id]/upload'>) {
	const session = await getSession();
	if (!session) return {error: Response.json({error: 'Sign in first.'}, {status: 401})};
	const {id} = await ctx.params;
	const project = await getOwnedProject(session.user.id, id);
	if (!project) return {error: Response.json({error: 'Project not found.'}, {status: 404})};
	if (project.sourceKey) return {error: Response.json({error: 'This project already has a video.'}, {status: 409})};
	return {project};
}

const Ask = z.object({kind: z.enum(['source', 'audio']), fileName: z.string().max(200), size: z.number().int().positive()});

// Production: returns a presigned S3 PUT so the browser uploads straight to the bucket.
export async function POST(request: Request, ctx: RouteContext<'/api/projects/[id]/upload'>) {
	if (storageMode !== 's3') return Response.json({error: 'S3 is not configured.'}, {status: 400});
	const o = await owned(ctx);
	if (o.error) return o.error;
	const parsed = Ask.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return Response.json({error: 'Invalid upload request.'}, {status: 400});
	const {kind, fileName, size} = parsed.data;
	const ext = kind === 'audio' ? '.wav' : path.extname(fileName).toLowerCase();
	if (kind === 'source' && !VIDEO_EXT.has(ext)) return Response.json({error: 'Upload an MP4, MOV, M4V, WebM or MKV file.'}, {status: 415});
	const max = kind === 'audio' ? MAX_AUDIO : MAX_VIDEO;
	if (size > max) return Response.json({error: kind === 'audio' ? 'The audio track is too large.' : 'Videos can be up to 2 GB.'}, {status: 413});
	const key = `projects/${o.project.id}/${kind}${ext}`;
	const {url, headers} = await presignedUpload(key, kind === 'audio' ? 'audio/wav' : VIDEO_TYPE[ext], max);
	return Response.json({key, url, headers});
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
