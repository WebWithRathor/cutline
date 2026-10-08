import {getSession} from '@/lib/auth';
import {getOwnedProject} from '@/lib/projects';
import {serveFile} from '@/server/storage';

// The uploaded clip, for the in-browser preview player.
export async function GET(request: Request, ctx: RouteContext<'/api/projects/[id]/source'>) {
	const session = await getSession();
	if (!session) return new Response('Unauthorized', {status: 401});
	const {id} = await ctx.params;
	const project = await getOwnedProject(session.user.id, id);
	if (!project?.sourceKey) return new Response('Not found', {status: 404});
	return serveFile(project.sourceKey, request, 'video/mp4');
}
