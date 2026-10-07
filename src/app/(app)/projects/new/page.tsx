import type {Metadata} from 'next';
import Link from 'next/link';
import {requireUser} from '@/lib/auth';
import {listKeys} from '@/lib/keys';
import {VARIANTS} from '@/variants';
import {NewProjectForm} from './NewProjectForm';

export const metadata: Metadata = {title: 'New video'};

export default async function NewProjectPage() {
	const user = await requireUser();
	const keys = new Set((await listKeys(user.id)).map((k) => k.provider));
	const ready = keys.has('anthropic') && (keys.has('openai') || keys.has('deepgram'));
	// functions can't cross to the client; send only the form definition
	const variants = VARIANTS.map(({id, name, description, fields, defaultPresetId}) => ({id, name, description, fields, defaultPresetId}));
	return (
		<div className="max-w-5xl">
			<h1 className="h-display text-3xl">New video</h1>
			{!ready && (
				<div className="mt-6 rounded-xl border border-line bg-surface p-5">
					<p className="font-semibold">Add your API keys first</p>
					<p className="mt-1 text-sm text-muted">Editing needs an Anthropic key and a transcription key (OpenAI or Deepgram).</p>
					<Link href="/settings/keys" className="btn btn-primary mt-4">Add API keys</Link>
				</div>
			)}
			<NewProjectForm variants={variants} disabled={!ready} />
		</div>
	);
}
