import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import type {CaptionedVideoProps} from '@/remotion/compositions';

let serveUrlPromise: Promise<string> | null = null;

// Bundle the Remotion project once per worker process.
export function getServeUrl() {
	serveUrlPromise ??= bundle({entryPoint: path.resolve(process.cwd(), 'src/remotion/index.ts')});
	return serveUrlPromise;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export async function renderCaptioned(opts: {
	props: CaptionedVideoProps;
	width: number;
	height: number;
	outputPath: string;
	onProgress: (p: number) => void;
}) {
	const serveUrl = await getServeUrl();
	const inputProps = {...opts.props, width: even(opts.width), height: even(opts.height)};
	const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
	const composition = await selectComposition({serveUrl, id: 'CaptionedVideo', inputProps, browserExecutable});
	await renderMedia({
		composition,
		serveUrl,
		codec: 'h264',
		crf: 20,
		outputLocation: opts.outputPath,
		inputProps,
		browserExecutable,
		concurrency: process.env.RENDER_CONCURRENCY ? Number(process.env.RENDER_CONCURRENCY) : null,
		onProgress: ({progress}) => opts.onProgress(progress),
	});
}
