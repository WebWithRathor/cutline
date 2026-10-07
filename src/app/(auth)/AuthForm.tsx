'use client';

import Link from 'next/link';
import {useRouter, useSearchParams} from 'next/navigation';
import {useState} from 'react';
import {signIn, signUp} from '@/lib/auth-client';

export function AuthForm({mode, googleEnabled}: {mode: 'sign-in' | 'sign-up'; googleEnabled: boolean}) {
	const router = useRouter();
	const next = useSearchParams().get('next') || '/dashboard';
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError(null);
		setPending(true);
		const f = new FormData(e.currentTarget);
		const email = String(f.get('email'));
		const password = String(f.get('password'));
		const res =
			mode === 'sign-up'
				? await signUp.email({email, password, name: String(f.get('name') || email.split('@')[0])})
				: await signIn.email({email, password});
		setPending(false);
		if (res.error) {
			setError(res.error.message ?? 'That didn’t work. Check your details and try again.');
			return;
		}
		router.push(next);
		router.refresh();
	}

	return (
		<div className="w-full max-w-sm">
			<h1 className="h-display text-3xl">{mode === 'sign-up' ? 'Create your account' : 'Sign in'}</h1>
			<p className="mt-2 text-sm text-muted">
				{mode === 'sign-up' ? 'Already have one? ' : 'New here? '}
				<Link className="font-semibold text-ink underline underline-offset-4" href={mode === 'sign-up' ? '/sign-in' : '/sign-up'}>
					{mode === 'sign-up' ? 'Sign in' : 'Create an account'}
				</Link>
			</p>

			<form onSubmit={onSubmit} className="mt-8 space-y-4">
				{mode === 'sign-up' && (
					<div>
						<label className="label" htmlFor="name">Name</label>
						<input id="name" name="name" className="field" autoComplete="name" />
					</div>
				)}
				<div>
					<label className="label" htmlFor="email">Email</label>
					<input id="email" name="email" type="email" required className="field" autoComplete="email" />
				</div>
				<div>
					<label className="label" htmlFor="password">Password</label>
					<input
						id="password"
						name="password"
						type="password"
						required
						minLength={8}
						className="field"
						autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
					/>
					{mode === 'sign-up' && <p className="hint">At least 8 characters.</p>}
				</div>
				{error && <p role="alert" className="text-sm text-bad">{error}</p>}
				<button type="submit" disabled={pending} className="btn btn-primary w-full">
					{pending ? 'One moment…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
				</button>
			</form>

			{googleEnabled && (
				<button
					type="button"
					onClick={() => signIn.social({provider: 'google', callbackURL: next})}
					className="btn btn-quiet mt-3 w-full"
				>
					Continue with Google
				</button>
			)}
		</div>
	);
}
