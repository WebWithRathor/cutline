declare module 'mp4box' {
	export type MP4ArrayBuffer = ArrayBuffer & {fileStart: number};
	export type MP4Track = {track_width: number; track_height: number; matrix?: number[]; codec: string};
	export type MP4Info = {duration: number; timescale: number; videoTracks: MP4Track[]; audioTracks: MP4Track[]};
	export type MP4File = {
		onReady?: (info: MP4Info) => void;
		onError?: (e: string) => void;
		appendBuffer: (buf: MP4ArrayBuffer) => number;
		flush: () => void;
	};
	export function createFile(): MP4File;
}
