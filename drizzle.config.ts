import {defineConfig} from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/db/schema.ts',
	out: './drizzle',
	dialect: process.env.DATABASE_AUTH_TOKEN ? 'turso' : 'sqlite',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? 'file:./data/cutline.db',
		authToken: process.env.DATABASE_AUTH_TOKEN,
	},
});
