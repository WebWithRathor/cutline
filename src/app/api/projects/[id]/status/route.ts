import {getSession} from '@/lib/auth';
import {getOwnedProject} from '@/lib/projects';
import {pollRender} from '@/server/render';

export async function GET(_request: Request, ctx: RouteContext<'/api/projects/[id]/status'>) {
	const session = await getSession();
	if (!session) return Response.json({error: 'Unauthorized'}, {status: 401});
	const {id} = await ctx.params;
	let p = await getOwnedProject(session.user.id, id);
	if (!p) return Response.json({error: 'Not found'}, {status: 404});
	if (p.status === 'rendering' && p.renderId) {
		await pollRender(p).catch((e) => console.error('poll render', e));
		p = (await getOwnedProject(session.user.id, id)) ?? p;
	}
	return Response.json({status: p.status, progress: p.progress, error: p.error, hasOutput: Boolean(p.outputKey)});
}
