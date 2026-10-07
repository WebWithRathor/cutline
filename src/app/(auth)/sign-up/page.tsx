import type {Metadata} from 'next';
import {Suspense} from 'react';
import {googleEnabled} from '@/lib/auth';
import {AuthForm} from '../AuthForm';

export const metadata: Metadata = {title: 'Create account'};

export default function SignUpPage() {
	return (
		<Suspense>
			<AuthForm mode="sign-up" googleEnabled={googleEnabled} />
		</Suspense>
	);
}
