import Link from 'next/link';
import {getSession} from '@/lib/auth';
import {StylePlayer} from '@/components/StylePlayer';
import {PRESET_META as PRESETS} from '@/remotion/captions/meta';

const STEPS = [
	{title: 'Upload your clip', body: 'A raw talking-head recording, straight from your phone or camera.'},
	{title: 'Describe the edit', body: 'Pick a video type, a caption style and how tight the pacing should be.'},
	{title: 'Get the short back', body: 'Silences cut, keywords highlighted, captions timed to every word.'},
];

export default async function Home() {
	const session = await getSession();
	return (
		<main>
			<header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
				<span className="h-display text-xl">Cutline</span>
				<nav className="flex items-center gap-3">
					{session ? (
						<Link className="btn btn-primary" href="/dashboard">Open dashboard</Link>
					) : (
						<>
							<Link className="btn btn-quiet" href="/sign-in">Sign in</Link>
							<Link className="btn btn-primary" href="/sign-up">Create account</Link>
						</>
					)}
				</nav>
			</header>

			<section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-8 md:grid-cols-[1.2fr_1fr]">
				<div>
					<h1 className="h-display text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">Raw clip in. Captioned short out.</h1>
					<p className="mt-6 max-w-xl text-lg text-muted">
						Cutline transcribes your video, trims the dead air, and burns in word-by-word captions in the style you pick. You bring your own AI keys, so you pay
						the providers directly.
					</p>
					<div className="mt-8 flex flex-wrap gap-3">
						<Link className="btn btn-primary px-6 py-3 text-base" href={session ? '/projects/new' : '/sign-up'}>
							Edit a video
						</Link>
						<Link className="btn btn-quiet px-6 py-3 text-base" href="#styles">See caption styles</Link>
					</div>
				</div>
				<div className="mx-auto w-full max-w-[320px] rounded-[28px] bg-ink p-3 shadow-[0_30px_60px_-20px_rgba(22,32,42,0.45)]">
					<StylePlayer style={{presetId: 'safe-zone-chip', overrides: {}}} />
				</div>
			</section>

			<section className="border-y border-line bg-surface">
				<ol className="mx-auto grid max-w-6xl gap-8 px-6 py-14 md:grid-cols-3">
					{STEPS.map((s, i) => (
						<li key={s.title}>
							<span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-mark text-sm font-bold">{i + 1}</span>
							<h2 className="h-display mt-4 text-xl">{s.title}</h2>
							<p className="mt-2 text-muted">{s.body}</p>
						</li>
					))}
				</ol>
			</section>

			<section id="styles" className="mx-auto max-w-6xl px-6 py-20">
				<h2 className="h-display text-3xl sm:text-4xl">{PRESETS.length} caption styles to start from</h2>
				<p className="mt-3 max-w-2xl text-muted">Every style takes your colors, font, size and position. These previews play on a stand-in clip.</p>
				<div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
					{PRESETS.slice(0, 8).map((p) => (
						<figure key={p.id}>
							<StylePlayer style={{presetId: p.id, overrides: {}}} />
							<figcaption className="mt-3">
								<span className="font-semibold">{p.name}</span>
								<span className="mt-0.5 block text-sm text-muted">{p.description}</span>
							</figcaption>
						</figure>
					))}
				</div>
			</section>
		</main>
	);
}
