import {spawn} from 'node:child_process';
import {copyFile, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';
import type {BrollCue, CreativeBrief} from '@/remotion/types';
import {callPlanner} from '@/server/pipeline/plan';

// HyperFrames B-roll: Claude writes a small HTML + CSS + GSAP animation, which is rendered to MP4 by the
// HyperFrames CLI on this machine. The page is locked down: a Content-Security-Policy blocks all network
// access, and only local files (GSAP, fonts) can load.

const NM = path.resolve(/*turbopackIgnore: true*/ process.cwd(), 'node_modules');
const FONTS = [
	['Montserrat', 800, '@fontsource/montserrat/files/montserrat-latin-800-normal.woff2'],
	['Montserrat', 900, '@fontsource/montserrat/files/montserrat-latin-900-normal.woff2'],
	['Inter', 500, '@fontsource/inter/files/inter-latin-500-normal.woff2'],
	['Inter', 700, '@fontsource/inter/files/inter-latin-700-normal.woff2'],
] as const;

export type Animation = {html: string; css: string; js: string};

const TOOL: Anthropic.Tool = {
	name: 'submit_animation',
	description: 'Submit the motion-graphics animation.',
	input_schema: {
		type: 'object',
		properties: {
			html: {type: 'string', description: 'Markup placed inside the stage div. Give elements ids/classes; no <script>, no external URLs, no images except inline SVG.'},
			css: {type: 'string', description: 'CSS for that markup. The stage is position:relative, overflow:hidden, at the given pixel size.'},
			js: {
				type: 'string',
				description:
					'JavaScript that adds tweens to the paused GSAP timeline `tl` (e.g. tl.from("#title", {y: 80, opacity: 0, duration: 0.6}, 0.2)). Variables W, H, DURATION and PALETTE are defined. Do not create other timelines, use timers, requestAnimationFrame, Math.random or network calls; everything must be driven by `tl` so frames render deterministically. The timeline should fill DURATION seconds.',
			},
		},
		required: ['html', 'css', 'js'],
	},
};

export async function writeAnimation(opts: {apiKey: string; cue: BrollCue; seconds: number; width: number; height: number; creative: CreativeBrief | null}): Promise<Animation> {
	const palette = opts.creative?.palette ?? ['#111111', '#FFFFFF', '#FFD43B'];
	return callPlanner<Animation>({
		apiKey: opts.apiKey,
		tool: TOOL,
		maxTokens: 6000,
		system:
			'You are a motion designer. You write short, polished motion-graphics clips as HTML + CSS + GSAP, used as B-roll cutaways in short-form videos. ' +
			'Bold, clean, modern: big type (Montserrat 800/900 or Inter 500/700, the only fonts available), generous spacing, smooth eased motion (power3/expo/back), staggered reveals, ' +
			'subtle continuous motion so it never sits still, readable within the first second. Use the palette. Keep text short and large enough for a phone screen. ' +
			'Shapes: CSS and inline SVG only. Never reference external files or URLs.',
		user: `Make a ${opts.seconds.toFixed(1)} second animation at ${opts.width}x${opts.height} px.
What it shows: ${opts.cue.prompt ?? opts.cue.card.title}
On-screen text to use (keep it this short): ${[opts.cue.card.title, opts.cue.card.sub, ...(opts.cue.card.items ?? [])].filter(Boolean).join(' | ')}
Palette (background, text, accent, ...): ${palette.join(', ')}
Video mood: ${opts.creative?.mood ?? 'confident'}; theme: ${opts.creative?.theme ?? ''}`,
	});
}

const esc = (s: string) => s.replace(/<\/(script|style)/gi, '<\\/$1');

export function compositionHtml(a: Animation, o: {seconds: number; width: number; height: number; palette: string[]}) {
	const fontFaces = FONTS.map(([family, weight, file]) => `@font-face{font-family:'${family}';font-weight:${weight};src:url('${path.basename(file)}') format('woff2');}`).join('\n');
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; connect-src 'none'">
<style>
${fontFaces}
html,body{margin:0;padding:0;background:${o.palette[0] ?? '#111'};}
#stage{position:relative;overflow:hidden;width:${o.width}px;height:${o.height}px;background:${o.palette[0] ?? '#111'};font-family:Montserrat,Inter,sans-serif;}
${esc(a.css)}
</style>
</head>
<body>
<div id="stage" data-composition-id="broll" data-start="0" data-duration="${o.seconds.toFixed(2)}" data-width="${o.width}" data-height="${o.height}">
${esc(a.html.replace(/<script[\s\S]*?<\/script>/gi, ''))}
</div>
<script src="gsap.min.js"></script>
<script>
(function () {
	var tl = gsap.timeline({paused: true});
	var W = ${o.width}, H = ${o.height}, DURATION = ${o.seconds.toFixed(2)}, PALETTE = ${JSON.stringify(o.palette)};
	try {
		(function (tl, W, H, DURATION, PALETTE) {
${esc(a.js)}
		})(tl, W, H, DURATION, PALETTE);
	} catch (e) { console.error(e); }
	if (tl.duration() < DURATION) tl.to({}, {duration: DURATION - tl.duration()});
	window.__timelines = window.__timelines || {};
	window.__timelines.broll = tl;
})();
</script>
</body>
</html>`;
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {cwd, env: {...process.env, HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1'}});
		let log = '';
		const keep = (d: Buffer) => {
			log = (log + d.toString()).slice(-4000);
		};
		child.stdout.on('data', keep);
		child.stderr.on('data', keep);
		const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
		child.on('error', (e) => {
			clearTimeout(timer);
			reject(e);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			if (code === 0) resolve();
			else reject(new Error(`hyperframes exited with ${code}: ${log.slice(-1500)}`));
		});
	});
}

// Writes the project folder and renders it. Returns the MP4 path.
export async function renderAnimation(a: Animation, o: {dir: string; seconds: number; width: number; height: number; palette: string[]}): Promise<string> {
	await mkdir(o.dir, {recursive: true});
	await writeFile(path.join(o.dir, 'index.html'), compositionHtml(a, o));
	await copyFile(path.join(NM, 'gsap/dist/gsap.min.js'), path.join(o.dir, 'gsap.min.js'));
	for (const [, , file] of FONTS) await copyFile(path.join(NM, file), path.join(o.dir, path.basename(file)));
	const out = path.join(o.dir, 'out.mp4');
	await run(path.join(NM, '.bin/hyperframes'), ['render', o.dir, '-o', out, '--fps', '30', '--quality', 'standard', '--quiet', '--workers', '2'], o.dir, 8 * 60 * 1000);
	return out;
}
