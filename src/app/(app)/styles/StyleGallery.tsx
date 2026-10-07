'use client';

import {useState} from 'react';
import {StyleEditor} from '@/components/StyleEditor';
import type {CaptionStyleChoice} from '@/remotion/types';

export function StyleGallery() {
	const [style, setStyle] = useState<CaptionStyleChoice>({presetId: 'dynamic-minimal', overrides: {}});
	return <StyleEditor value={style} onChange={setStyle} />;
}
