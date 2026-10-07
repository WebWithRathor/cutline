'use client';

import {useRouter} from 'next/navigation';
import {signOut} from '@/lib/auth-client';

export function SignOutButton() {
	const router = useRouter();
	return (
		<button
			type="button"
			className="mt-3 px-2 text-sm text-muted underline underline-offset-4 hover:text-ink"
			onClick={async () => {
				await signOut();
				router.push('/');
				router.refresh();
			}}
		>
			Sign out
		</button>
	);
}
