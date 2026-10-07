'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';

const LINKS = [
	{href: '/dashboard', label: 'Videos'},
	{href: '/styles', label: 'Caption styles'},
	{href: '/settings/keys', label: 'API keys'},
];

export function NavLinks() {
	const path = usePathname();
	return (
		<nav className="flex gap-1 overflow-x-auto md:flex-col">
			{LINKS.map((l) => {
				const active = path === l.href || (l.href === '/dashboard' && path.startsWith('/projects'));
				return (
					<Link
						key={l.href}
						href={l.href}
						aria-current={active ? 'page' : undefined}
						className={`whitespace-nowrap rounded-md px-2 py-1.5 text-sm font-medium ${active ? 'bg-mark text-ink' : 'text-muted hover:text-ink'}`}
					>
						{l.label}
					</Link>
				);
			})}
		</nav>
	);
}
