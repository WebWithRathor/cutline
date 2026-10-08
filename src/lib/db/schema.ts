import {boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex} from 'drizzle-orm/pg-core';
import type {CaptionStyleChoice, CreativeBrief, EditPlan, Word} from '@/remotion/types';

// Postgres (Supabase). Only the server talks to the database (as the table owner, which bypasses RLS).
// RLS is enabled with no policies so Supabase's public Data API (anon / authenticated keys) can read nothing.

const ts = (name: string) => timestamp(name, {withTimezone: true, mode: 'date'});
const timestamps = {
	createdAt: ts('created_at').notNull().defaultNow(),
	updatedAt: ts('updated_at')
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
};

// ---------- Better Auth tables ----------

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').notNull().default(false),
	image: text('image'),
	...timestamps,
}).enableRLS();

export const session = pgTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: ts('expires_at').notNull(),
		token: text('token').notNull().unique(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, {onDelete: 'cascade'}),
		...timestamps,
	},
	(t) => [index('session_user_idx').on(t.userId)],
).enableRLS();

export const account = pgTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, {onDelete: 'cascade'}),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: ts('access_token_expires_at'),
		refreshTokenExpiresAt: ts('refresh_token_expires_at'),
		scope: text('scope'),
		password: text('password'),
		...timestamps,
	},
	(t) => [index('account_user_idx').on(t.userId)],
).enableRLS();

export const verification = pgTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: ts('expires_at').notNull(),
	...timestamps,
}).enableRLS();

// ---------- App tables ----------

// Gemini watches the video and writes the creative brief; Claude edits; Higgsfield (optional) makes AI B-roll.
export const PROVIDERS = ['gemini', 'anthropic', 'higgsfield'] as const;
export type Provider = (typeof PROVIDERS)[number];

// User-supplied API keys, encrypted at rest (AES-256-GCM). Plaintext never leaves the server.
export const apiKey = pgTable(
	'api_key',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, {onDelete: 'cascade'}),
		provider: text('provider', {enum: PROVIDERS}).notNull(),
		ciphertext: text('ciphertext').notNull(),
		last4: text('last4').notNull(),
		...timestamps,
	},
	(t) => [uniqueIndex('api_key_user_provider_idx').on(t.userId, t.provider)],
).enableRLS();

export const PROJECT_STATUSES = ['draft', 'queued', 'transcribing', 'analyzing', 'planning', 'review', 'generating', 'rendering', 'done', 'failed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const project = pgTable(
	'project',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, {onDelete: 'cascade'}),
		title: text('title').notNull(),
		variantId: text('variant_id').notNull(),
		brief: jsonb('brief').$type<Record<string, unknown>>().notNull().default({}),
		captionStyle: jsonb('caption_style').$type<CaptionStyleChoice>().notNull(),
		status: text('status', {enum: PROJECT_STATUSES}).notNull().default('draft'),
		progress: doublePrecision('progress').notNull().default(0),
		error: text('error'),
		sourceKey: text('source_key'),
		sourceName: text('source_name'),
		audioKey: text('audio_key'), // 16 kHz mono WAV extracted in the browser, used for transcription
		renderId: text('render_id'), // Remotion Lambda render in flight
		renderBucket: text('render_bucket'),
		durationSec: doublePrecision('duration_sec'),
		width: integer('width'),
		height: integer('height'),
		transcript: jsonb('transcript').$type<Word[]>(),
		creative: jsonb('creative').$type<CreativeBrief>(), // Gemini's creative brief
		plan: jsonb('plan').$type<EditPlan>(),
		outputKey: text('output_key'),
		...timestamps,
	},
	(t) => [index('project_user_idx').on(t.userId)],
).enableRLS();

// Local render queue (development / self-hosting without Lambda).
export const job = pgTable(
	'job',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, {onDelete: 'cascade'}),
		status: text('status', {enum: ['queued', 'running', 'done', 'failed']})
			.notNull()
			.default('queued'),
		mode: text('mode', {enum: ['render']})
			.notNull()
			.default('render'),
		attempts: integer('attempts').notNull().default(0),
		error: text('error'),
		lockedAt: ts('locked_at'),
		...timestamps,
	},
	(t) => [index('job_status_idx').on(t.status)],
).enableRLS();
