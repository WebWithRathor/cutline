import {drizzle} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Supabase Postgres. Use the pooler connection string (transaction mode, port 6543) for the app;
// prepared statements are off because the transaction pooler does not support them.
const building = process.env.NEXT_PHASE === 'phase-production-build';
const url = process.env.DATABASE_URL ?? (building ? 'postgres://build-time-placeholder/none' : undefined);
if (!url) throw new Error('DATABASE_URL is not set (Supabase: Project Settings → Database → Connection string → Transaction pooler).');

const globalForDb = globalThis as unknown as {sql?: ReturnType<typeof postgres>};
const sql =
	globalForDb.sql ??
	postgres(url, {
		prepare: false,
		max: process.env.VERCEL ? 1 : 10, // serverless: one connection per function instance; the pooler fans out
		idle_timeout: 20,
	});
if (process.env.NODE_ENV !== 'production') globalForDb.sql = sql;

export const db = drizzle(sql, {schema});
export {schema};
