import {createClient} from '@libsql/client';
import {drizzle} from 'drizzle-orm/libsql';
import * as schema from './schema';

// libSQL: a local SQLite file in development, Turso (or any libSQL server) in production.
const url = process.env.DATABASE_URL ?? 'file:./data/cutline.db';

const globalForDb = globalThis as unknown as {client?: ReturnType<typeof createClient>};
const client = globalForDb.client ?? createClient({url, authToken: process.env.DATABASE_AUTH_TOKEN});
if (!globalForDb.client && url.startsWith('file:')) {
	// local SQLite is shared by the web app and the render worker: wait on locks instead of failing
	void client.execute('PRAGMA journal_mode = WAL').catch(() => undefined);
	void client.execute('PRAGMA busy_timeout = 8000').catch(() => undefined);
}
if (process.env.NODE_ENV !== 'production') globalForDb.client = client;

export const db = drizzle(client, {schema});
export {schema};
