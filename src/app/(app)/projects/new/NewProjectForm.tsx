'use client';

import {useRouter} from 'next/navigation';
import {useMemo, useState} from 'react';
import {StyleEditor} from '@/components/StyleEditor';
import type {CaptionStyleChoice} from '@/remotion/types';
import type {Field, Variant} from '@/variants';
import {createProject} from '../actions';

type ClientVariant = Omit<Variant, 'plannerGuidance'>;

const defaultsOf = (v: ClientVariant) => Object.fromEntries(v.fields.map((f) => [f.name, 'default' in f ? f.default : ''])) as Record<string, string | boolean>;

function uploadFile(projectId: string, file: File, onProgress: (p: number) => void) {
	return new Promise<void>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('PUT', `/api/projects/${projectId}/source`);
		xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
		xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) resolve();
			else {
				let msg = 'Upload failed. Try again.';
				try {
					msg = JSON.parse(xhr.responseText).error ?? msg;
				} catch {}
				reject(new Error(msg));
			}
		};
		xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
		xhr.send(file);
	});
}

export function NewProjectForm({variants, disabled}: {variants: ClientVariant[]; disabled: boolean}) {
	const router = useRouter();
	const [variantId, setVariantId] = useState(variants[0].id);
	const variant = useMemo(() => variants.find((v) => v.id === variantId)!, [variants, variantId]);
	const [brief, setBrief] = useState(() => defaultsOf(variants[0]));
	const [style, setStyle] = useState<CaptionStyleChoice>({presetId: variants[0].defaultPresetId, overrides: {}});
	const [file, setFile] = useState<File | null>(null);
	const [title, setTitle] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [phase, setPhase] = useState<'idle' | 'creating' | 'uploading'>('idle');
	const [progress, setProgress] = useState(0);

	function pickVariant(v: ClientVariant) {
		setVariantId(v.id);
		setBrief(defaultsOf(v));
		setStyle({presetId: v.defaultPresetId, overrides: {}});
	}

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		if (!file) return setError('Choose a video to upload.');
		setPhase('creating');
		const res = await createProject({title: title || file.name.replace(/\.[^.]+$/, ''), variantId, brief, style});
		if (!res.id) {
			setPhase('idle');
			return setError(res.error ?? 'Something went wrong.');
		}
		setPhase('uploading');
		try {
			await uploadFile(res.id, file, setProgress);
			router.push(`/projects/${res.id}`);
		} catch (err) {
			setPhase('idle');
			setError(err instanceof Error ? err.message : 'Upload failed.');
		}
	}

	const field = (f: Field) => {
		const id = `f-${f.name}`;
		const val = brief[f.name];
		const update = (v: string | boolean) => setBrief((b) => ({...b, [f.name]: v}));
		return (
			<div key={f.name} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
				{f.type === 'toggle' ? (
					<label className="flex items-center gap-3 text-sm font-medium">
						<input id={id} type="checkbox" className="h-4 w-4 accent-ink" checked={Boolean(val)} onChange={(e) => update(e.target.checked)} />
						{f.label}
					</label>
				) : (
					<>
						<label className="label" htmlFor={id}>{f.label}
							{(f.type === 'text' || f.type === 'textarea') && !f.required ? ' (optional)' : ''}</label>
						{f.type === 'select' ? (
							<select id={id} className="field" value={String(val)} onChange={(e) => update(e.target.value)}>
								{f.options.map((o) => (
									<option key={o.value} value={o.value}>{o.label}</option>
								))}
							</select>
						) : f.type === 'textarea' ? (
							<textarea id={id} rows={3} className="field" placeholder={f.placeholder} value={String(val)} onChange={(e) => update(e.target.value)} />
						) : (
							<input id={id} className="field" placeholder={f.placeholder} required={f.required} value={String(val)} onChange={(e) => update(e.target.value)} />
						)}
					</>
				)}
				{f.hint && <p className="hint">{f.hint}</p>}
			</div>
		);
	};

	const busy = phase !== 'idle';

	return (
		<form onSubmit={submit} className="mt-8 space-y-10">
			<section>
				<h2 className="h-display text-xl">Video</h2>
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
					<div className="sm:col-span-2">
						<label
							htmlFor="file"
							className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-surface px-6 py-10 text-center hover:border-ink"
						>
							<span className="font-semibold">{file ? file.name : 'Choose a video'}</span>
							<span className="mt-1 text-sm text-muted">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : 'MP4, MOV, M4V, WebM or MKV, up to 1 GB'}</span>
							<input
								id="file"
								type="file"
								accept="video/mp4,video/quicktime,video/x-m4v,video/webm,video/x-matroska,.mkv"
								className="sr-only"
								onChange={(e) => setFile(e.target.files?.[0] ?? null)}
							/>
						</label>
					</div>
					<div className="sm:col-span-2">
						<label className="label" htmlFor="title">Title (optional)</label>
						<input id="title" className="field" placeholder={file?.name.replace(/\.[^.]+$/, '') ?? 'Used for the file name'} value={title} onChange={(e) => setTitle(e.target.value)} />
					</div>
				</div>
			</section>

			<section>
				<h2 className="h-display text-xl">Type of video</h2>
				<div className="mt-4 grid gap-3 sm:grid-cols-2">
					{variants.map((v) => (
						<button
							key={v.id}
							type="button"
							aria-pressed={v.id === variantId}
							onClick={() => pickVariant(v)}
							className={`rounded-xl border p-4 text-left ${v.id === variantId ? 'border-ink bg-mark' : 'border-line bg-surface hover:border-ink'}`}
						>
							<span className="font-semibold">{v.name}</span>
							<span className={`mt-1 block text-sm ${v.id === variantId ? 'text-ink' : 'text-muted'}`}>{v.description}</span>
						</button>
					))}
				</div>
				<div className="mt-6 grid gap-5 sm:grid-cols-2">{variant.fields.map(field)}</div>
			</section>

			<section>
				<h2 className="h-display text-xl">Caption style</h2>
				<div className="mt-4">
					<StyleEditor value={style} onChange={setStyle} />
				</div>
			</section>

			<div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-4 border-t border-line bg-fog/95 px-5 py-4 backdrop-blur sm:-mx-10 sm:px-10">
				<button className="btn btn-primary px-6" disabled={disabled || busy}>
					{phase === 'creating' ? 'Creating…' : phase === 'uploading' ? `Uploading ${Math.round(progress * 100)}%` : 'Upload and edit'}
				</button>
				{error && <p role="alert" className="text-sm text-bad">{error}</p>}
			</div>
		</form>
	);
}
