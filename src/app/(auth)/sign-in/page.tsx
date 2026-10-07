import type {Metadata} from 'next';
import {Suspense} from 'react';
import {googleEnabled} from '@/lib/auth';
import {AuthForm} from '../AuthForm';

export const metadata: Metadata = {title: 'Sign in'};

export default function SignInPage() {
	return (
		<Suspense>
			<AuthForm mode="sign-in" googleEnabled={googleEnabled} />
		</Suspense>
	);
}
