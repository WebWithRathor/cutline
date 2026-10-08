import {eq} from 'drizzle-orm';
import {after} from 'next/server';
import {z} from 'zod';
import {getSession} from '@/lib/auth';
import {db, schema} from '@/lib/db';
import {getOwnedProject} from '@/lib/projects';
import {brollModeOf} from '@/remotion/fx/meta';
import {track} from '@/server/activity';
import {analyzeProject} from '@/server/pipeline/analyze';
import {getVariant} from '@/variants';
import {sizeOf} from '@/server/storage';

export const maxDuration = 300; // transcription + planning run after the response, within this budget

const Body = z.object({
	sourceKey: z.string().max(300),
	audioKey: z.string().max(300).nullable(),
	sourceName: z.string().max(200),
	durationSec: z.number().positive().max(60 * 60 * 3),
	width: z.number().int().positive().max(8192),
	height: z.number().int().positive().max(8192),
});

// Called by the browser once its uploads finish. Records the files and starts the edit in the background.
export async function POST(request: Request, ctx: RouteContext<'/api/projects/[id]/start'>) {
	const session = await getSession();
	if (!session) return Response.json({error: 'Sign in first.'}, {status: 401});
	const {id} = await ctx.params;
	const project = await getOwnedProject(session.user.id, id);
	if (!project) return Response.json({error: 'Project not found.'}, {status: 404});
	if (project.sourceKey) return Response.json({error: 'This project already started.'}, {status: 409});
	const parsed = Body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return Response.json({error: 'Missing upload details.'}, {status: 400});
	const b = parsed.data;
	const prefix = `projects/${id}/`;
	if (!b.sourceKey.startsWith(prefix) || (b.audioKey && !b.audioKey.startsWith(prefix))) return Response.json({error: 'Invalid upload.'}, {status: 400});
	if (!(await sizeOf(b.sourceKey))) return Response.json({error: 'The video upload did not finish.'}, {status: 400});
	const audioKey = b.audioKey && (await sizeOf(b.audioKey)) ? b.audioKey : null;

	await db
		.update(schema.project)
		.set({sourceKey: b.sourceKey, audioKey, sourceName: b.sourceName, durationSec: b.durationSec, width: b.width, height: b.height, status: 'queued', progress: 0.02, error: null})
		.where(eq(schema.project.id, id));
	const t = track(id);
	await t.reset({broll: getVariant(project.variantId)?.renderer === 'captioned' && brollModeOf(project.brief.broll) !== 'none'});
	await t.done('upload', `${b.sourceName} · ${b.width}×${b.height} · ${Math.floor(b.durationSec / 60)}:${String(Math.round(b.durationSec % 60)).padStart(2, '0')}${audioKey ? ' · audio extracted in the browser' : ''}`);
	after(() => analyzeProject(id));
	return Response.json({ok: true});
}
