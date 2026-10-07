# Cutline

Upload a raw talking-head clip, describe the edit, and get back a cut, captioned short. Users bring their own AI keys.

## What it does

1. **Sign up / sign in** (email + password; Google optional).
2. **API keys**: users save an Anthropic key (edit planning) and a transcription key (OpenAI Whisper or Deepgram). Keys are encrypted with AES-256-GCM before storage and never sent back to the browser.
3. **New video**: upload a clip, choose a video type (variant), fill in the brief, pick and tune a caption style with a live preview.
4. **Worker** runs the edit: probe → extract audio → transcribe (word timestamps) → Claude plans cuts / keywords / zooms / hook → Remotion renders the MP4.
5. **Result page**: watch, download, or change the caption style and re-render (reuses the transcript and plan).

## Run locally

Requirements: Node 20.9+, `ffmpeg` and `ffprobe` on PATH (or set `FFMPEG_PATH` / `FFPROBE_PATH`).

```bash
npm install
cp .env.example .env.local      # fill in the secrets (openssl rand -base64 32)
npm run db:migrate              # creates ./data/cutline.db
npm run dev                     # web app on http://localhost:3000
npm run worker                  # render worker, in a second terminal
```

`CUTLINE_FAKE_AI=1 npm run worker` replaces transcription and planning with canned data (dev only) so you can test the full flow, including real renders, without spending credits.

`npm run studio` opens Remotion Studio on the caption compositions.

## Project layout

| Path | What lives there |
| --- | --- |
| `src/app/(auth)` | Sign-in / sign-up |
| `src/app/(app)` | Signed-in app: videos, new video, project page, caption styles, API keys |
| `src/app/api` | Auth handler, upload / stream / download routes, status polling, signed media URLs for the renderer |
| `src/remotion` | Compositions (`CaptionedVideo`, `StylePreview`), caption engine, 14 presets, timeline (cuts → output time) |
| `src/remotion/captions/meta.ts` | Preset names / defaults (safe for server code) |
| `src/variants` | Video types. **Kit Student** and **Talking head** today; add one by adding an entry |
| `src/server/pipeline` | Worker steps: media probing, transcription, planning, rendering |
| `scripts/worker.ts` | Job loop (polls the `job` table) |
| `src/lib/db` | Drizzle schema (libSQL / SQLite locally, Turso in production) |

## Adding a variant

Add an object to `VARIANTS` in `src/variants/index.ts`: its brief `fields` render as the form automatically, `defaultPresetId` picks the starting caption style, and `plannerGuidance(brief)` adds instructions to the Claude edit plan.

## Adding a caption style

Write a component in `src/remotion/captions/presets.tsx` using the engine hooks (`usePage`, `useWord`, `useStyle`, `Placement`), add its metadata to `meta.ts`, and register it in `COMPONENTS`. It automatically gets color, font, size, position and words-on-screen overrides.

## Production notes

- **Remotion license**: free for individuals and companies of up to 3 people; larger companies need a [company license](https://www.remotion.dev/license).
- **Rendering** is CPU-heavy: run the worker on its own machine/container (or move `renderCaptioned` to Remotion Lambda). Set `APP_URL` so the worker can fetch source media through signed URLs.
- **Storage** is local disk behind `src/server/storage.ts`; swap to S3/R2 there.
- **Editorial Behind** places text behind the person only when a person matte exists; without segmentation it draws the big word over the video.
- The worker uses `claude-sonnet-5-5` by default (`ANTHROPIC_MODEL` to change).
