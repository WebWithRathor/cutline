import type {Metadata} from 'next';
import './globals.css';

export const metadata: Metadata = {
	title: {default: 'Cutline', template: '%s · Cutline'},
	description: 'Turn a raw talking-head clip into a captioned, edited short.',
};

export default function RootLayout({children}: LayoutProps<'/'>) {
	return (
		<html lang="en" className="h-full antialiased">
			<body className="min-h-full">{children}</body>
		</html>
	);
}
