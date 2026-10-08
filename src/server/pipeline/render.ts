import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';

// Local rendering (worker process). Production renders run in a Vercel Sandbox instead (src/server/render.ts).
let serveUrlPromise: Promise<string> | null = null;

export function getServeUrl() {
	serveUrlPromise ??= bundle({entryPoint: path.resolve(process.cwd(), 'src/remotion/index.ts')});
	return serveUrlPromise;
}

export async function renderComposition(opts: {compositionId: string; inputProps: Record<string, unknown>; outputPath: string; onProgress: (p: number) => void}) {
	const serveUrl = await getServeUrl();
	const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
	const composition = await selectComposition({serveUrl, id: opts.compositionId, inputProps: opts.inputProps, browserExecutable});
	await renderMedia({
		composition,
		serveUrl,
		codec: 'h264',
		crf: 20,
		outputLocation: opts.outputPath,
		inputProps: opts.inputProps,
		browserExecutable,
		concurrency: process.env.RENDER_CONCURRENCY ? Number(process.env.RENDER_CONCURRENCY) : null,
		onProgress: ({progress}) => opts.onProgress(progress),
	});
}
