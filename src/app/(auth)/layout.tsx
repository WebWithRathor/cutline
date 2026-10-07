import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getSession} from '@/lib/auth';
import {StylePlayer} from '@/components/StylePlayer';

export default async function AuthLayout({children}: LayoutProps<'/'>) {
	if (await getSession()) redirect('/dashboard');
	return (
		<main className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,520px)]">
			<div className="flex flex-col px-6 py-8 sm:px-12">
				<Link href="/" className="h-display text-xl">Cutline</Link>
				<div className="flex flex-1 items-center justify-center py-12">{children}</div>
			</div>
			<aside className="hidden items-center justify-center bg-ink p-12 lg:flex">
				<div className="w-full max-w-[300px]">
					<StylePlayer style={{presetId: 'glow-stack', overrides: {}}} />
				</div>
			</aside>
		</main>
	);
}
