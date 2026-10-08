# Cutline

Upload a raw talking-head clip, describe the edit, and get back a cut, captioned, graded video with effects, sound and B-roll. Users bring their own AI keys.

Two AI models do the work. **Gemini** transcribes the recording and watches the video, then writes a creative brief: theme, mood, audience, pacing, palette, caption style, colour grade, VFX, sound effects and B-roll ideas (each suggesting Remotion, HyperFrames or Higgsfield). **Claude** edits from that brief: the cuts and keywords, and exactly which word every effect, sound and B-roll clip lands on. Everything is shown as a **storyboard you approve** before anything is generated or rendered.

## Video types

| Type | What it makes | Flow |
| --- | --- | --- |
| **Kit Student** | ~1 min kids explainer, 1920×1080 @ 25 fps, with the Kokoon cast (Kiko, Sparky, Ohmie, the Zips, Batt, Grandpa Bulb) from `kids-kit/` | Gemini transcribes + writes the brief → Claude picks best takes, beat plan and sound effects → **storyboard: you approve** (live preview) → render |
| **Talking head** | Short in the clip's own size: 14 caption styles, 9 colour grades, VFX, sound effects, B-roll | Gemini transcribes + writes the brief → Claude plans cuts, captions, grade, VFX, SFX, B-roll → **storyboard: you approve or adjust** → B-roll generated → render; restyle and re-render any time |

The presenter's recorded voice is never replaced or generated. Takes are only cut.

## How it works

1. **Sign up / sign in** (email + password; Google optional). Better Auth, sessions in Postgres.
2. **API keys**: Gemini (transcription + creative brief) and Anthropic (the edit), plus Higgsfield (optional, AI footage B-roll; pasted as `KEY_ID:KEY_SECRET`). AES-256-GCM encrypted, never sent back to the browser.
3. **Upload**: the browser reads the clip's size and length (MP4/MOV parsed from the container, so HEVC works too), extracts a 16 kHz mono WAV with WebAudio, and uploads both: to the local `storage/` folder on your Mac, or straight to S3 with presigned URLs once S3 is configured.
4. **Analysis** runs in the background (`after()` in `/api/projects/[id]/start`):
   - **Transcription (Gemini)**: the WAV is split into ~75 s chunks at the quietest moment near each boundary and transcribed word by word with timings (Flash model, Pro as fallback). Without a WAV, Gemini listens to the uploaded video.
   - **Creative brief (Gemini)**: the video goes to the Gemini File API; the newest Pro model watches it with the timed transcript and returns the brief as JSON (`src/server/pipeline/creative.ts`).
   - **Edit plan (Claude)**: one forced tool call returns cuts, keywords, zooms, hook, caption style, grade, VFX, SFX and B-roll, all as word indices; `toPlan()` and `sanitizeLook()` turn them into safe, timed data. Claude's caption pick replaces the form's style unless the creator turned that off.
   Each finished step is saved, so retries and re-plans only redo what is missing.
5. **Storyboard**: the project stops at `review`. The storyboard shows the brief and the edit as panels (real preview frames, what is seen, heard, and every effect). The creator can change the grade or captions, switch any B-roll clip between Remotion / HyperFrames / Higgsfield, remove clips, effects or sounds, or send notes to Claude to revise it. **Nothing is generated or rendered until it's approved.**
6. **B-roll generation** (after approval, in the render worker): HyperFrames clips are animations Claude writes in HTML + CSS + GSAP, rendered by the HyperFrames CLI inside a page whose Content-Security-Policy blocks all network access; Higgsfield clips are text-to-video (Seedance 2.0 by default, `HIGGSFIELD_MODEL` to change). A clip that fails keeps its Remotion card and the reason shows on the storyboard.
7. **Render**: on your Mac the render worker (`npm run local` starts it) renders with Remotion and saves the MP4 next to the upload. In the cloud setup, Remotion Lambda renders and writes into the S3 bucket instead.
8. **Playback and downloads** stream from your disk locally (or from short-lived CloudFront / S3 signed URLs in the cloud setup).

Stack: Next.js 16 · Supabase Postgres (Drizzle) · Remotion. Runs fully on your Mac with local files; can move to Vercel + S3/CloudFront + Remotion Lambda later.

## Run it on your Mac (start here)

Everything runs on your computer: the app, uploads (saved in the `storage/` folder inside the project) and video rendering. Only the database is in the cloud, on Supabase's free plan.

**You need:** [Node.js 22 or newer](https://nodejs.org) (or `brew install node`), [FFmpeg](https://ffmpeg.org) (`brew install ffmpeg`; HyperFrames needs it), git, and a free [Supabase](https://supabase.com) account.

1. **Create the database.** In Supabase, create a new project (any name; pick the Mumbai region and save the database password). When it's ready, click **Connect** and copy the **Transaction pooler** connection string.
2. **Get the code and set it up** (in Terminal):

   ```bash
   git clone https://github.com/WebWithRathor/cutline.git
   cd cutline
   npm install
   npm run setup        # paste the Supabase string (with your password in place of [YOUR-PASSWORD])
   ```

   `setup` writes `.env.local` with fresh secrets and creates the tables. Keep `.env.local` private.
3. **Start it:**

   ```bash
   npm run local        # updates the database if needed, then runs the app and the video renderer; stop with Ctrl+C
   ```

   Open <http://localhost:3000>, create an account, add your API keys (Gemini and Anthropic; Higgsfield optional), and make a video. The first render downloads a headless Chrome for Remotion (about 100 MB), once.

To try the whole flow without spending API credits, start with `CUTLINE_FAKE_AI=1 npm run local`. That swaps transcription, the brief and the storyboard for canned data, so the captions won't match the speech.

**Free Supabase notes:** 500 MB of database (plenty: videos are on your disk, only text like transcripts and plans goes in the database). Projects **pause after a week without use**; open the Supabase dashboard and click Restore if the app says it can't reach the database.

**Updating from an older version:** run `npm install`, then `npm run local` (it applies new database changes before starting; `npm run db:migrate` does only that). The migration deletes saved OpenAI and Deepgram keys (transcription moved to Gemini); add a Gemini key in API keys.

**Other handy commands:** `npm run studio` opens Remotion Studio on the compositions (`CaptionedVideo`, `KidsExplainer`, `StylePreview`); `npm run db:migrate` applies new database changes after pulling updates.

## Later: move to the cloud

When you are ready to host it, the app already supports Vercel + S3/CloudFront + Remotion Lambda. Nothing below is needed to run it on your Mac.

Pick one AWS region for everything (Mumbai `ap-south-1` is close to India; Remotion Lambda supports it). Set the variables below in Vercel → Project Settings → Environment Variables. Vercel reserves `AWS_*` names, which is why these use `S3_*`, `CLOUDFRONT_*` and `REMOTION_AWS_*`.

### 1. Supabase (database)

1. Create a project (same region as AWS if possible).
2. Project Settings → Database → Connection string:
   - **Transaction pooler** (port 6543) → `DATABASE_URL` (used by the app)
   - **Session pooler** or direct (port 5432) → `DATABASE_URL_DIRECT` (used for migrations during the build)
3. Migrations run on every Vercel build (`drizzle-kit migrate`). Every table has Row Level Security on with no policies, so Supabase's public Data API can't read them; the app connects as the table owner.

Better Auth handles sign-in (not Supabase Auth), so nothing else in Supabase needs setting up.

### 2. S3 bucket

1. Create a bucket, e.g. `cutline-media`. Keep **Block all public access** on and **ACLs disabled**.
2. Permissions → CORS (replace the origin with your domain):

```json
[
  {
    "AllowedOrigins": ["https://your-app.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

3. Set `S3_BUCKET` and `S3_REGION`.

### 3. CloudFront (signed reads)

1. Create a key pair for URL signing:
   `openssl genrsa -out cf_private.pem 2048 && openssl rsa -pubout -in cf_private.pem -out cf_public.pem`
2. CloudFront → Public keys → add `cf_public.pem`; then Key groups → create one with that key.
3. Create a distribution: origin = the bucket, **Origin access control (OAC)** (copy the bucket policy it gives you into the bucket), viewer protocol **Redirect HTTP to HTTPS**, **Restrict viewer access: Yes → Trusted key groups →** your key group.
4. Set `CLOUDFRONT_DOMAIN` (e.g. `d1234abcd.cloudfront.net`), `CLOUDFRONT_KEY_PAIR_ID` (the public key's ID) and `CLOUDFRONT_PRIVATE_KEY` (contents of `cf_private.pem`; on one line with `\n` for newlines is fine).

Without the CloudFront variables the app falls back to S3 presigned URLs, which also work.

### 4. Remotion Lambda (rendering)

Follow Remotion's Lambda setup to create the IAM role and user: <https://www.remotion.dev/docs/lambda/setup>. Then:

1. Set `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY` and `REMOTION_AWS_REGION`. The app also uses these for S3 unless you set separate `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`, so give the same IAM user `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::cutline-media/*` and `s3:ListBucket` on `arn:aws:s3:::cutline-media`.
2. Let renders write into your bucket: add an inline policy to the **`remotion-lambda-role`** allowing `s3:PutObject`, `s3:GetObject` on `arn:aws:s3:::cutline-media/*`.
3. Deploy the function once (and again whenever you upgrade Remotion; it must match `4.0.534`):
   `npx remotion lambda functions deploy --memory=3009 --timeout=900 --disk=10240`
   Put the printed name in `REMOTION_LAMBDA_FUNCTION`.
4. Deploy the compositions: `npm run deploy:site`. Put the printed URL in `REMOTION_SERVE_URL`. Production Vercel builds redeploy the same site automatically, so renders always use the current code.

### 5. Vercel

1. Import `WebWithRathor/cutline`. `vercel.json` runs `npm run vercel-build` (migrate → `next build` → Lambda site deploy).
2. Also set `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, `FILE_URL_SECRET` (each `openssl rand -base64 32`; never change `ENCRYPTION_KEY` once users have saved keys) and `BETTER_AUTH_URL` (your production URL). Optional: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_MODEL`.
3. Deploy. Set an AWS budget alert: Lambda renders, CloudFront and S3 are billed by usage.

## Project layout

| Path | What lives there |
| --- | --- |
| `src/app/(auth)`, `src/app/(app)` | Pages: sign-in, videos, new video, project (review / result), caption styles, API keys |
| `src/app/api/projects/[id]/*` | `upload` (presigned S3 PUT, or local PUT), `start`, `status` (polls Lambda renders), `source`, `output` |
| `src/server/pipeline` | `analyze` (the pipeline), `gemini` (REST client), `transcribe` (Gemini word timings), `creative` (Gemini brief), `plan` (talking head), `plan-kids` (Kit Student), `fx` (grade / VFX / SFX / B-roll schema + validation), `fake` (dev), `render` (local) |
| `src/server/broll` | B-roll generation after approval: `hyperframes` (Claude-written GSAP animation, sandboxed render), `higgsfield` (text-to-video) |
| `src/lib/storyboard.ts` | Splits a plan into storyboard panels |
| `src/remotion/fx` | Grades, VFX, SFX and B-roll cards (`meta.ts` is the catalogue the AI prompts use; `Look.tsx` draws them) |
| `public/sfx` | Sound effects, synthesized by `npm run sfx` (no sample licences) |
| `src/server/render.ts` | Render driver: Remotion Lambda (writes to the bucket) or the local job queue |
| `src/server/storage.ts` | S3 or local disk behind one interface; presigned uploads, CloudFront signed reads |
| `src/remotion` | Compositions, caption engine + 14 presets, timeline (cuts → output time) |
| `src/remotion/kids` | Kids-edit-kit runtime: evaluates the kit's own canvas code and draws plan shots (`scenes.ts`) |
| `kids-kit/` | The kit (characters.js, props.js, prims.js, comp_template.html, fonts). After editing, run `npm run sync-kit` |
| `src/variants` | Video types. Add one by adding an entry |
| `scripts/worker.ts`, `scripts/deploy-lambda-site.ts` | Local render worker; Remotion Lambda site deploy |
| `src/lib/db` | Drizzle schema and client (Supabase Postgres via the transaction pooler) |

## Extending Kit Student

- New beats or cutaway types: add a shot/scene type in `src/remotion/types.ts`, draw it in `src/remotion/kids/scenes.ts`, and describe it in the planner prompt and tool schema in `src/server/pipeline/plan-kids.ts` (validated in `sanitizeShots`).
- New character: add it to `kids-kit/characters.js`, run `npm run sync-kit`, then add it to `KIDS_CHARACTERS`, `POSES` in `scenes.ts`, and the cast list in `plan-kids.ts`.
- Plans are data only. Nothing the model writes is executed.

## Notes

- **Big uploads** use a single presigned PUT (S3 allows up to 5 GB; the app caps at 2 GB). Multipart uploads would add resumability for slow connections.
- **Remotion license**: free for individuals and companies of up to 3 people; larger companies need a [company license](https://www.remotion.dev/license).
- **Generated B-roll on Lambda**: HyperFrames needs a local Chrome + FFmpeg and Higgsfield polls for minutes, so only the local worker generates clips. With Remotion Lambda, those clips use their Remotion card.
- **Gemini uploads** read the whole source video into memory before sending it to the File API (2 GB max there). Fine on a Mac; streaming it would help on small servers.
- **Editorial Behind** places text behind the person only when a person matte exists; without segmentation it draws the big word over the video.
