import {defineConfig} from 'drizzle-kit';

// Migrations use the direct / session connection (port 5432) when given, since DDL through the
// transaction pooler can misbehave. Falls back to DATABASE_URL.
export default defineConfig({
	schema: './src/lib/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {url: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL || ''},
});
