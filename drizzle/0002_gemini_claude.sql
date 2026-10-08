ALTER TABLE "project" ADD COLUMN "creative" jsonb;--> statement-breakpoint
-- Transcription moved to Gemini: OpenAI and Deepgram keys are no longer used.
DELETE FROM "api_key" WHERE "provider" IN ('openai', 'deepgram');
