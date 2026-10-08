# Cutline

Upload a raw talking-head clip, describe the edit, and get back a cut, captioned video. Users bring their own AI keys.

## Video types

| Type | What it makes | Flow |
| --- | --- | --- |
| **Kit Student** | ~1 min kids explainer, 1920×1080 @ 25 fps, with the Kokoon cast (Kiko, Sparky, Ohmie, the Zips, Batt, Grandpa Bulb) from `kids-kit/` | transcribe → Claude picks best takes + beat plan → **you review and approve** (live preview) → render |
| **Talking head** | Short in the clip's own size with one of 14 caption styles | transcribe → Claude plans cuts / keywords / zooms → render; restyle and re-render any time |

The presenter's recorded voice is never replaced or generated. Takes are only cut.

## How it works

1. **Sign up / sign in** (email + password; Google optional). Better Auth.
2. **API keys**: Anthropic (planning) plus OpenAI Whisper or Deepgram (transcription). AES-256-GCM encrypted, never sent back to the browser.
3. **Upload**: the browser reads the clip's size and length (MP4/MOV parsed from the container, so HEVC works too), extracts a 16 kHz mono WAV with WebAudio, and uploads both directly to storage (Vercel Blob in production, local disk in dev).
4. **Analysis** runs in the background (`after()` in `/api/projects/[id]/start`): transcription, then the variant's planner. Claude only returns word indices; `toPlan()` turns them into time ranges.
5. **Render**: production renders run detached in a **Vercel Sandbox** started from a snapshot taken at build time, writing the MP4 to Blob. The status endpoint polls progress. In dev, `npm run worker` renders locally.

## Run locally

Requirements: Node 20.9+.

```bash
npm install
cp .env.example .env.local      # fill in the secrets (openssl rand -base64 32)
npm run db:migrate              # creates ./data/cutline.db
npm run dev                     # web app on http://localhost:3000
npm run worker                  # local render worker, in a second terminal
```

`CUTLINE_FAKE_AI=1 npm run dev` replaces transcription and planning with canned data (never on Vercel) so you can test the whole flow, including real renders and the Kit Student review, without spending credits.

`npm run studio` opens Remotion Studio on the compositions (`CaptionedVideo`, `KidsExplainer`, `StylePreview`).

## Deploy on Vercel

1. Push this repo to GitHub and import it in Vercel (framework: Next.js). `vercel.json` sets the build command to `npm run vercel-build` (migrate DB → `next build` → render snapshot).
2. **Storage → Blob**: create a Blob store and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`.
3. **Database**: create a Turso database (or add Turso from the Vercel Marketplace) and set `DATABASE_URL` (`libsql://…`) and `DATABASE_AUTH_TOKEN`.
4. **Environment variables** (Production and Preview):
   - `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `FILE_URL_SECRET`: each `openssl rand -base64 32`. Keep `ENCRYPTION_KEY` forever; changing it makes saved API keys unreadable.
   - `BETTER_AUTH_URL`: your production URL, e.g. `https://cutline.vercel.app`.
   - Optional: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`).
5. Deploy. The build log should end with `[create-snapshot] saved snap_…`. Renders need Vercel Sandbox, which uses the project's OIDC token automatically.
6. Recommended: set **Spend Management** in Vercel. Sandboxes, snapshots and Blob storage are billed by usage; deleted videos remove their files.

Limits to know: Hobby allows 10 concurrent sandbox renders and 45-minute sandboxes; Pro allows many more. `@remotion/vercel` is marked experimental by Remotion.

## Project layout

| Path | What lives there |
| --- | --- |
| `src/app/(auth)`, `src/app/(app)` | Pages: sign-in, videos, new video, project (review / result), caption styles, API keys |
| `src/app/api/projects/[id]/*` | `upload` (Blob client tokens or local PUT), `start`, `status` (polls sandbox renders), `source`, `output` |
| `src/server/pipeline` | `analyze` (transcribe + plan), `transcribe`, `plan` (talking head), `plan-kids` (Kit Student), `fake` (dev), `render` (local) |
| `src/server/render.ts`, `sandbox.ts` | Render driver: Vercel Sandbox (detached, from snapshot) or local job queue |
| `src/server/storage.ts` | Blob or local disk behind one interface; presigned media URLs |
| `src/remotion` | Compositions, caption engine + 14 presets, timeline (cuts → output time) |
| `src/remotion/kids` | Kids-edit-kit runtime: evaluates the kit's own canvas code and draws plan shots (`scenes.ts`) |
| `kids-kit/` | The kit (characters.js, props.js, prims.js, comp_template.html, fonts). After editing, run `npm run sync-kit` |
| `src/variants` | Video types. Add one by adding an entry |
| `scripts/worker.ts`, `scripts/create-snapshot.ts` | Local render worker; Vercel build snapshot |

## Extending Kit Student

- New beats or cutaway types: add a shot/scene type in `src/remotion/types.ts`, draw it in `src/remotion/kids/scenes.ts`, and describe it in the planner prompt and tool schema in `src/server/pipeline/plan-kids.ts` (validated in `sanitizeShots`).
- New character: add it to `kids-kit/characters.js`, run `npm run sync-kit`, then add it to `KIDS_CHARACTERS`, `POSES` in `scenes.ts`, and the cast list in `plan-kids.ts`.
- Plans are data only. Nothing the model writes is executed.

## Notes

- **Remotion license**: free for individuals and companies of up to 3 people; larger companies need a [company license](https://www.remotion.dev/license).
- **Editorial Behind** places text behind the person only when a person matte exists; without segmentation it draws the big word over the video.
