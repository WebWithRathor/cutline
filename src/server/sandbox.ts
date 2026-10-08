import {get, put} from '@vercel/blob';
import {Sandbox} from '@vercel/sandbox';

// A Vercel Sandbox with Chrome, FFmpeg and our Remotion bundle is snapshotted once per deployment
// (scripts/create-snapshot.ts runs in the Vercel build). Renders start from that snapshot in seconds.

const snapshotKey = () => `snapshot-cache/${process.env.VERCEL_DEPLOYMENT_ID ?? 'local'}.json`;

export async function saveSnapshotId(snapshotId: string) {
	await put(snapshotKey(), JSON.stringify({snapshotId}), {access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true});
}

export async function restoreSnapshotSandbox() {
	const blob = await get(snapshotKey(), {access: 'private'});
	if (!blob || blob.statusCode !== 200) throw new Error('No render snapshot for this deployment. The Vercel build must run scripts/create-snapshot.ts.');
	const {snapshotId} = (await new Response(blob.stream).json()) as {snapshotId?: string};
	if (!snapshotId) throw new Error('The render snapshot record is empty. Redeploy to rebuild it.');
	return Sandbox.create({source: {type: 'snapshot', snapshotId}, timeout: 45 * 60 * 1000});
}
