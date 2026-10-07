'use client';

import {Player} from '@remotion/player';
import {StylePreview} from '@/remotion/compositions';
import type {CaptionStyleChoice} from '@/remotion/types';

// Looping, muted preview of a caption style on the stand-in scene.
export function StylePlayer({style, className, controls = false}: {style: CaptionStyleChoice; className?: string; controls?: boolean}) {
	return (
		<Player
			component={StylePreview}
			inputProps={{style}}
			durationInFrames={300}
			fps={30}
			compositionWidth={1080}
			compositionHeight={1920}
			autoPlay
			loop
			controls={controls}
			acknowledgeRemotionLicense
			className={className}
			style={{width: '100%', aspectRatio: '9 / 16', borderRadius: 14, overflow: 'hidden'}}
		/>
	);
}
