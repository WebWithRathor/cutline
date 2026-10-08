import React from 'react';
import {Composition} from 'remotion';
import {KIDS_FPS, KIDS_H, KIDS_W, KidsExplainer, kidsDurationMs, type KidsExplainerProps} from './kids/KidsExplainer';
import {CaptionedVideo, StylePreview, captionedVideoDurationMs, type CaptionedVideoProps, type StylePreviewProps} from './compositions';

export const FPS = 30;

// Entry for the render worker (bundled with @remotion/bundler) and for `npx remotion studio`.
export const RemotionRoot: React.FC = () => (
	<>
		<Composition
			id="CaptionedVideo"
			component={CaptionedVideo}
			fps={FPS}
			width={1080}
			height={1920}
			durationInFrames={300}
			defaultProps={
				{
					src: '',
					sourceDurationMs: 10000,
					words: [],
					plan: null,
					style: {presetId: 'dynamic-minimal', overrides: {}},
				} satisfies CaptionedVideoProps
			}
			calculateMetadata={({props}) => ({
				durationInFrames: Math.max(1, Math.round((captionedVideoDurationMs(props) / 1000) * FPS)),
				width: (props as CaptionedVideoProps & {width?: number}).width ?? 1080,
				height: (props as CaptionedVideoProps & {height?: number}).height ?? 1920,
			})}
		/>
		<Composition
			id="KidsExplainer"
			component={KidsExplainer}
			fps={KIDS_FPS}
			width={KIDS_W}
			height={KIDS_H}
			durationInFrames={250}
			defaultProps={{src: '', sourceDurationMs: 10000, words: [], plan: null} satisfies KidsExplainerProps}
			calculateMetadata={({props}) => ({durationInFrames: Math.max(1, Math.round((kidsDurationMs(props) / 1000) * KIDS_FPS))})}
		/>
		<Composition
			id="StylePreview"
			component={StylePreview}
			fps={FPS}
			width={1080}
			height={1920}
			durationInFrames={300}
			defaultProps={{style: {presetId: 'dynamic-minimal', overrides: {}}} satisfies StylePreviewProps}
		/>
	</>
);
