import {sql} from 'drizzle-orm';
import {index, integer, real, sqliteTable, text, uniqueIndex} from 'drizzle-orm/sqlite-core';

const timestamps = {
	createdAt: integer('created_at', {mode: 'timestamp_ms'})
		.notNull()
		.default(sql`(unixepoch() * 1000)`),
	updatedAt: integer('updated_at', {mode: 'timestamp_ms'})
		.notNull()
		.default(sql`(unixepoch() * 1000)`)
		.$onUpdate(() => new Date()),
};

// ---------- Better Auth tables ----------

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: integer('email_verified', {mode: 'boolean'}).notNull().default(false),
	image: text('image'),
	...timestamps,
});

export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: integer('expires_at', {mode: 'timestamp_ms'}).notNull(),
		token: text('token').notNull().unique(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, {onDelete: 'cascade'}),
		...timestamps,
	},
	(t) => [index('session_user_idx').on(t.userId)],
);

export const account = sqliteTable(
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
		accessTokenExpiresAt: integer('access_token_expires_at', {mode: 'timestamp_ms'}),
		refreshTokenExpiresAt: integer('refresh_token_expires_at', {mode: 'timestamp_ms'}),
		scope: text('scope'),
		password: text('password'),
		...timestamps,
	},
	(t) => [index('account_user_idx').on(t.userId)],
);

export const verification = sqliteTable('verification', {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: integer('expires_at', {mode: 'timestamp_ms'}).notNull(),
	...timestamps,
});

// ---------- App tables ----------

export const PROVIDERS = ['anthropic', 'openai', 'deepgram'] as const;
export type Provider = (typeof PROVIDERS)[number];

// User-supplied API keys, encrypted at rest (AES-256-GCM). Plaintext never leaves the server.
export const apiKey = sqliteTable(
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
);

export const PROJECT_STATUSES = ['draft', 'queued', 'transcribing', 'planning', 'rendering', 'done', 'failed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const project = sqliteTable(
	'project',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, {onDelete: 'cascade'}),
		title: text('title').notNull(),
		variantId: text('variant_id').notNull(),
		brief: text('brief', {mode: 'json'}).$type<Record<string, unknown>>().notNull().default({}),
		captionStyle: text('caption_style', {mode: 'json'}).$type<import('@/remotion/types').CaptionStyleChoice>().notNull(),
		status: text('status', {enum: PROJECT_STATUSES}).notNull().default('draft'),
		progress: real('progress').notNull().default(0),
		error: text('error'),
		sourceKey: text('source_key'),
		sourceName: text('source_name'),
		durationSec: real('duration_sec'),
		width: integer('width'),
		height: integer('height'),
		transcript: text('transcript', {mode: 'json'}).$type<import('@/remotion/types').Word[]>(),
		plan: text('plan', {mode: 'json'}).$type<import('@/remotion/types').EditPlan>(),
		outputKey: text('output_key'),
		...timestamps,
	},
	(t) => [index('project_user_idx').on(t.userId)],
);

export const job = sqliteTable(
	'job',
	{
		id: text('id').primaryKey(),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, {onDelete: 'cascade'}),
		status: text('status', {enum: ['queued', 'running', 'done', 'failed']})
			.notNull()
			.default('queued'),
		mode: text('mode', {enum: ['full', 'render']})
			.notNull()
			.default('full'), // full = transcribe + plan + render; render = re-render with current plan/style
		attempts: integer('attempts').notNull().default(0),
		error: text('error'),
		lockedAt: integer('locked_at', {mode: 'timestamp_ms'}),
		...timestamps,
	},
	(t) => [index('job_status_idx').on(t.status)],
);
