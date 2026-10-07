import Link from 'next/link';
import {requireUser} from '@/lib/auth';
import {NavLinks} from './NavLinks';
import {SignOutButton} from './SignOutButton';

export default async function AppLayout({children}: LayoutProps<'/'>) {
	const user = await requireUser();
	return (
		<div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
			<aside className="flex flex-col gap-6 border-b border-line bg-surface px-4 py-4 md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r md:py-6">
				<div className="flex items-center justify-between">
					<Link href="/dashboard" className="h-display px-2 text-xl">Cutline</Link>
					<Link href="/projects/new" className="btn btn-primary md:hidden">New video</Link>
				</div>
				<Link href="/projects/new" className="btn btn-primary hidden md:flex">New video</Link>
				<NavLinks />
				<div className="mt-auto hidden border-t border-line pt-4 md:block">
					<p className="truncate px-2 text-sm font-medium">{user.name}</p>
					<p className="truncate px-2 text-xs text-muted">{user.email}</p>
					<SignOutButton />
				</div>
			</aside>
			<main className="min-w-0 px-5 py-8 sm:px-10">{children}</main>
		</div>
	);
}
