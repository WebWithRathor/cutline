'use client';

import {FONT_CHOICES} from '@/remotion/fonts';
import {PRESETS, getPreset} from '@/remotion/captions/presets';
import type {CaptionOverrides, CaptionStyleChoice} from '@/remotion/types';
import {StylePlayer} from './StylePlayer';

const GROUPS = ['Trending', 'From your references'] as const;

// Picks a preset and tunes it. The large preview updates live.
export function StyleEditor({value, onChange, preview}: {value: CaptionStyleChoice; onChange: (v: CaptionStyleChoice) => void; preview?: React.ReactNode}) {
	const preset = getPreset(value.presetId);
	const o = value.overrides;
	const set = (patch: Partial<CaptionOverrides>) => {
		const next = {...o, ...patch};
		for (const k of Object.keys(next) as (keyof CaptionOverrides)[]) if (next[k] === undefined) delete next[k];
		onChange({...value, overrides: next});
	};
	// strip a CSS font stack like '"TikTok Sans"' to a plain family name
	const defaultFont = preset.defaults.font.replace(/"/g, '');

	return (
		<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
			<div className="space-y-6">
				{GROUPS.map((g) => (
					<fieldset key={g}>
						<legend className="mb-2 text-sm font-semibold">{g}</legend>
						<div className="flex flex-wrap gap-2">
							{PRESETS.filter((p) => p.group === g).map((p) => {
								const on = p.id === value.presetId;
								return (
									<button
										key={p.id}
										type="button"
										aria-pressed={on}
										onClick={() => onChange({presetId: p.id, overrides: {}})}
										className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${on ? 'border-ink bg-mark font-semibold' : 'border-line bg-surface hover:border-ink'}`}
									>
										{p.name}
									</button>
								);
							})}
						</div>
					</fieldset>
				))}
				<p className="text-sm text-muted">{preset.description}</p>

				<div className="grid gap-5 rounded-xl border border-line bg-surface p-5 sm:grid-cols-2">
					<div className="flex gap-4">
						<div>
							<label className="label" htmlFor="primaryColor">Text color</label>
							<input id="primaryColor" type="color" className="h-10 w-16 cursor-pointer rounded-md border border-line bg-surface" value={o.primaryColor ?? preset.defaults.primary} onChange={(e) => set({primaryColor: e.target.value})} />
						</div>
						<div>
							<label className="label" htmlFor="accentColor">Highlight color</label>
							<input id="accentColor" type="color" className="h-10 w-16 cursor-pointer rounded-md border border-line bg-surface" value={o.accentColor ?? preset.defaults.accent} onChange={(e) => set({accentColor: e.target.value})} />
						</div>
					</div>
					<div>
						<label className="label" htmlFor="font">Font</label>
						<select id="font" className="field" value={o.fontFamily ?? ''} onChange={(e) => set({fontFamily: e.target.value || undefined})}>
							<option value="">{defaultFont} (style default)</option>
							{FONT_CHOICES.filter((f) => f !== defaultFont).map((f) => (
								<option key={f} value={f}>{f}</option>
							))}
						</select>
					</div>
					<div>
						<label className="label" htmlFor="size">Size {Math.round((o.sizeScale ?? 1) * 100)}%</label>
						<input id="size" type="range" min={0.6} max={1.6} step={0.05} className="w-full accent-ink" value={o.sizeScale ?? 1} onChange={(e) => set({sizeScale: Number(e.target.value)})} />
					</div>
					<div>
						<label className="label" htmlFor="pace">Words on screen</label>
						<input id="pace" type="range" min={300} max={2400} step={100} className="w-full accent-ink" value={o.pageMs ?? 1200} onChange={(e) => set({pageMs: Number(e.target.value)})} />
						<p className="hint">Left: one word at a time. Right: longer phrases.</p>
					</div>
					<div className="sm:col-span-2">
						<div className="flex items-center justify-between">
							<label className="label" htmlFor="pos">Vertical position</label>
							<label className="flex items-center gap-2 text-sm text-muted">
								<input type="checkbox" checked={o.positionY === undefined} onChange={(e) => set({positionY: e.target.checked ? undefined : 0.7})} />
								Style default
							</label>
						</div>
						<input id="pos" type="range" min={0.1} max={0.9} step={0.01} disabled={o.positionY === undefined} className="w-full accent-ink disabled:opacity-40" value={o.positionY ?? 0.7} onChange={(e) => set({positionY: Number(e.target.value)})} />
					</div>
					{Object.keys(o).length > 0 && (
						<button type="button" className="justify-self-start text-sm underline underline-offset-4 sm:col-span-2" onClick={() => onChange({...value, overrides: {}})}>
							Reset to style defaults
						</button>
					)}
				</div>
			</div>
			<div className="mx-auto w-full max-w-[280px] lg:sticky lg:top-8 lg:self-start">
				{preview ?? <StylePlayer style={value} />}
			</div>
		</div>
	);
}
