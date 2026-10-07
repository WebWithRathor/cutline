import type {Metadata} from 'next';
import {StyleGallery} from './StyleGallery';

export const metadata: Metadata = {title: 'Caption styles'};

export default function StylesPage() {
	return (
		<div className="max-w-6xl">
			<h1 className="h-display text-3xl">Caption styles</h1>
			<p className="mt-2 max-w-2xl text-muted">
				Try a style and tune it. You choose the style for each video when you create it, and you can change it after the edit without re-transcribing.
			</p>
			<div className="mt-8">
				<StyleGallery />
			</div>
		</div>
	);
}
