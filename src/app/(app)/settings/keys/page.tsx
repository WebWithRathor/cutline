import type {Metadata} from 'next';
import {requireUser} from '@/lib/auth';
import {PROVIDERS} from '@/lib/db/schema';
import {PROVIDER_INFO, listKeys} from '@/lib/keys';
import {KeyRow} from './KeyRow';

export const metadata: Metadata = {title: 'API keys'};

export default async function KeysPage() {
	const user = await requireUser();
	const saved = new Map((await listKeys(user.id)).map((k) => [k.provider, k]));
	return (
		<div className="max-w-3xl">
			<h1 className="h-display text-3xl">API keys</h1>
			<p className="mt-2 text-muted">
				Cutline calls these providers with your keys, so usage is billed to your accounts. Keys are encrypted before they’re stored and are never shown again
				after you save them.
			</p>
			<p className="mt-2 text-sm text-muted">You need a Gemini key and an Anthropic key. Higgsfield is optional: without it, AI-footage B-roll falls back to built-in animated cards.</p>
			<ul className="mt-8 divide-y divide-line rounded-xl border border-line bg-surface">
				{PROVIDERS.map((p) => (
					<KeyRow key={p} provider={p} info={PROVIDER_INFO[p]} saved={saved.get(p) ? {last4: saved.get(p)!.last4} : null} />
				))}
			</ul>
		</div>
	);
}
