'use client';

import {useActionState, useState} from 'react';
import type {Provider} from '@/lib/db/schema';
import {deleteKey, saveKey, type KeyFormState} from './actions';

export function KeyRow({
	provider,
	info,
	saved,
}: {
	provider: Provider;
	info: {name: string; use: string; placeholder: string; docs: string; optional?: boolean};
	saved: {last4: string} | null;
}) {
	const [editing, setEditing] = useState(!saved);
	const [state, action, pending] = useActionState<KeyFormState, FormData>(async (prev, form) => {
		const res = await saveKey(prev, form);
		if (res?.ok) setEditing(false);
		return res;
	}, null);

	return (
		<li className="p-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="font-semibold">{info.name}</h2>
					<p className="mt-0.5 text-sm text-muted">{info.use}</p>
				</div>
				{saved && !editing && (
					<div className="flex items-center gap-3">
						<span className="rounded-md bg-fog px-2 py-1 text-sm">Saved, ends in {saved.last4}</span>
						<button type="button" className="text-sm font-semibold underline underline-offset-4" onClick={() => setEditing(true)}>
							Replace
						</button>
						<form action={deleteKey}>
							<input type="hidden" name="provider" value={provider} />
							<button className="text-sm text-bad underline underline-offset-4">Remove</button>
						</form>
					</div>
				)}
			</div>
			{editing && (
				<form action={action} className="mt-4 flex flex-col gap-2 sm:flex-row">
					<input type="hidden" name="provider" value={provider} />
					<label className="sr-only" htmlFor={`key-${provider}`}>{info.name} API key</label>
					<input
						id={`key-${provider}`}
						name="key"
						type="password"
						autoComplete="off"
						spellCheck={false}
						placeholder={info.placeholder}
						className="field font-mono"
						required
					/>
					<button className="btn btn-primary shrink-0" disabled={pending}>{pending ? 'Saving…' : 'Save key'}</button>
					{saved && (
						<button type="button" className="btn btn-quiet shrink-0" onClick={() => setEditing(false)}>Cancel</button>
					)}
				</form>
			)}
			{editing && (
				<p className="hint">
					Get one at{' '}
					<a className="underline underline-offset-2" href={info.docs} target="_blank" rel="noreferrer">
						{new URL(info.docs).hostname}
					</a>
					.
				</p>
			)}
			{state?.error && <p role="alert" className="mt-2 text-sm text-bad">{state.error}</p>}
		</li>
	);
}
