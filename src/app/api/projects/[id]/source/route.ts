import path from 'node:path';
import {eq} from 'drizzle-orm';
import {getSession} from '@/lib/auth';
import {db, schema} from '@/lib/db';
import {enqueue, getOwnedProject} from '@/lib/projects';
import {fileResponse, storage} from '@/lib/storage';

const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB
const ALLOWED = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);

// Upload the raw clip: PUT the file as the request body. Starts the edit once stored.
export async function PUT(request: Request, ctx: RouteContext<'/api/projects/[id]/source'>) {
	const session = await getSession();
	if (!session) return Response.json({error: 'Sign in first.'}, {status: 401});
	const {id} = await ctx.params;
	const project = await getOwnedProject(session.user.id, id);
	if (!project) return Response.json({error: 'Project not found.'}, {status: 404});
	if (project.sourceKey) return Response.json({error: 'This project already has a video.'}, {status: 409});

	const name = decodeURIComponent(request.headers.get('x-file-name') ?? 'video.mp4');
	const ext = path.extname(name).toLowerCase() || '.mp4';
	if (!ALLOWED.has(ext)) return Response.json({error: 'Upload an MP4, MOV, M4V, WebM or MKV file.'}, {status: 415});
	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > MAX_BYTES) return Response.json({error: 'Videos can be up to 1 GB.'}, {status: 413});
	if (!request.body) return Response.json({error: 'No file received.'}, {status: 400});

	const key = `projects/${id}/source${ext}`;
	try {
		await storage.write(key, request.body, MAX_BYTES);
	} catch (e) {
		return Response.json({error: e instanceof Error && e.message === 'File too large' ? 'Videos can be up to 1 GB.' : 'Upload failed. Try again.'}, {status: 400});
	}
	await db.update(schema.project).set({sourceKey: key, sourceName: name}).where(eq(schema.project.id, id));
	await enqueue(id, 'full');
	return Response.json({ok: true});
}

// Stream the source back (for the in-browser preview player).
export async function GET(request: Request, ctx: RouteContext<'/api/projects/[id]/source'>) {
	const session = await getSession();
	if (!session) return new Response('Unauthorized', {status: 401});
	const {id} = await ctx.params;
	const project = await getOwnedProject(session.user.id, id);
	if (!project?.sourceKey) return new Response('Not found', {status: 404});
	return fileResponse(project.sourceKey, request, 'video/mp4');
}
