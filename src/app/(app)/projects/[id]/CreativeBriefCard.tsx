import {getPresetMeta} from '@/remotion/captions/meta';
import {getGrade} from '@/remotion/fx/meta';
import type {CreativeBrief} from '@/remotion/types';

// Gemini's read of the video, shown at the top of the storyboard.
export function CreativeBriefCard({creative, kids}: {creative: CreativeBrief; kids?: boolean}) {
	const rows: [string, string][] = [
		['Theme', creative.theme],
		['Mood', creative.mood],
		['Audience', creative.audience],
		['Pacing', creative.pacing],
	];
	return (
		<div className="rounded-xl border border-line bg-surface p-5">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<h3 className="font-semibold">Creative brief</h3>
				<span className="text-xs text-muted">Gemini watched the video</span>
			</div>
			{creative.summary && <p className="mt-2 text-sm">{creative.summary}</p>}
			<dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
				{rows.map(([k, v]) => (
					<div key={k}>
						<dt className="text-muted">{k}</dt>
						<dd className="mt-0.5 font-medium first-letter:uppercase">{v || '—'}</dd>
					</div>
				))}
			</dl>
			<div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
				{!kids && (
					<div>
						<p className="text-muted">Captions</p>
						<p className="mt-0.5 font-medium">{getPresetMeta(creative.captionPresetId).name}</p>
						{creative.captionWhy && <p className="mt-0.5 text-xs text-muted">{creative.captionWhy}</p>}
					</div>
				)}
				{!kids && (
					<div>
						<p className="text-muted">Colour grade</p>
						<p className="mt-0.5 font-medium">{getGrade(creative.grade).name}</p>
						{creative.gradeWhy && <p className="mt-0.5 text-xs text-muted">{creative.gradeWhy}</p>}
					</div>
				)}
				<div>
					<p className="text-muted">Palette</p>
					<div className="mt-1.5 flex gap-1.5">
						{creative.palette.map((c) => (
							<span key={c} title={c} className="h-6 w-6 rounded-md border border-line" style={{background: c}} />
						))}
					</div>
				</div>
				{creative.notes && (
					<div className="sm:col-span-2">
						<p className="text-muted">Director’s notes</p>
						<p className="mt-0.5">{creative.notes}</p>
					</div>
				)}
			</div>
		</div>
	);
}
