# Notes for Claude sessions

@AGENTS.md

- Product: Cutline. Next.js 16 (App Router, Turbopack), Better Auth, Drizzle + libSQL (SQLite locally, Turso in prod), Remotion 4.0.534 (all remotion packages pinned to the same exact version; zod pinned to 4.5.4 for Remotion).
- Hosting: Vercel. Uploads go browser → Vercel Blob (private). Renders run in Vercel Sandbox via `@remotion/vercel` (pinned `@vercel/sandbox@1.6.0`; v3 broke the sandboxId API it uses). Local dev renders with `npm run worker`.
- Test without credits: `CUTLINE_FAKE_AI=1` (dev only). The sandbox's bundled Chromium can't decode H.264; use real Chrome or WebM clips for browser tests.
- Kit Student follows the user's `kids-explainer-edit` skill: never generate or replace the presenter's voice; show takes + beat plan and wait for approval; character bubbles ≤ 5 words; only true science in visuals.
- `kids-kit/` is the source of truth for the cast. Run `npm run sync-kit` after changing it (regenerates `src/remotion/kids/kit-source.ts`).
- Checks before committing: `npm run typecheck`, `npx eslint src scripts`, `npx next build`.
