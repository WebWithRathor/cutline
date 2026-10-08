import {getSession} from '@/lib/auth';
import {getOwnedProject} from '@/lib/projects';
import {serveFile} from '@/server/storage';

export async function GET(request: Request, ctx: RouteContext<'/api/projects/[id]/output'>) {
	const session = await getSession();
	if (!session) return new Response('Unauthorized', {status: 401});
	const {id} = await ctx.params;
	const project = await getOwnedProject(session.user.id, id);
	if (!project?.outputKey) return new Response('Not found', {status: 404});
	const download = new URL(request.url).searchParams.has('download');
	const name = `${project.title.replace(/[^\w\- ]+/g, '').trim() || 'cutline'}.mp4`;
	return serveFile(project.outputKey, request, 'video/mp4', download ? name : undefined);
}
