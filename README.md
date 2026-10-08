# Cutline

Upload a raw talking-head clip, describe the edit, and get back a cut, captioned video. Users bring their own AI keys.

## Video types

| Type | What it makes | Flow |
| --- | --- | --- |
| **Kit Student** | ~1 min kids explainer, 1920×1080 @ 25 fps, with the Kokoon cast (Kiko, Sparky, Ohmie, the Zips, Batt, Grandpa Bulb) from `kids-kit/` | transcribe → Claude picks best takes + beat plan → **you review and approve** (live preview) → render |
| **Talking head** | Short in the clip's own size with one of 14 caption styles | transcribe → Claude plans cuts / keywords / zooms → render; restyle and re-render any time |

The presenter's recorded voice is never replaced or generated. Takes are only cut.

## How it works

1. **Sign up / sign in** (email + password; Google optional). Better Auth, sessions in Postgres.
2. **API keys**: Anthropic (planning) plus OpenAI Whisper or Deepgram (transcription). AES-256-GCM encrypted, never sent back to the browser.
3. **Upload**: the browser reads the clip's size and length (MP4/MOV parsed from the container, so HEVC works too), extracts a 16 kHz mono WAV with WebAudio, and uploads both **straight to S3** with presigned PUT URLs.
4. **Analysis** runs in the background (`after()` in `/api/projects/[id]/start`): transcription, then the variant's planner. Claude only returns word indices; `toPlan()` turns them into time ranges.
5. **Render**: **Remotion Lambda** renders the composition (reading the source through a CloudFront signed URL) and writes the MP4 straight into the S3 bucket. The status endpoint polls progress. Without Lambda, `npm run worker` renders locally.
6. **Playback and downloads** redirect to short-lived CloudFront signed URLs (downloads use S3 presigned URLs so the filename sticks).

Stack: Next.js 16 on Vercel · Supabase Postgres (Drizzle) · S3 + CloudFront · Remotion Lambda.

## Run locally

Requirements: Node 20.9+ and a Postgres database (a free Supabase project works, or `npx supabase start`, or any local Postgres).

```bash
npm install
cp .env.example .env.local      # set DATABASE_URL and the three secrets (openssl rand -base64 32)
npm run db:migrate
npm run dev                     # web app on http://localhost:3000
npm run worker                  # local render worker, in a second terminal
```

Without `S3_BUCKET`, files are stored in `./storage`. Set the S3 variables to use your bucket from local dev too (add `http://localhost:3000` to the bucket's CORS).

`CUTLINE_FAKE_AI=1 npm run dev` replaces transcription and planning with canned data (never on Vercel) so you can test the whole flow, including real renders and the Kit Student review, without spending credits.

`npm run studio` opens Remotion Studio on the compositions (`CaptionedVideo`, `KidsExplainer`, `StylePreview`).

## Deploy

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
| `src/server/pipeline` | `analyze` (transcribe + plan), `transcribe`, `plan` (talking head), `plan-kids` (Kit Student), `fake` (dev), `render` (local) |
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
- **Editorial Behind** places text behind the person only when a person matte exists; without segmentation it draws the big word over the video.
