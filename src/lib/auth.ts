import 'server-only';
import {betterAuth} from 'better-auth';
import {drizzleAdapter} from 'better-auth/adapters/drizzle';
import {nextCookies} from 'better-auth/next-js';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {cache} from 'react';
import {db, schema} from './db';

const google =
	process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
		? {google: {clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET}}
		: undefined;

const baseURL =
	process.env.BETTER_AUTH_URL ??
	(process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

export const auth = betterAuth({
	baseURL,
	// preview deployments get their own URLs
	trustedOrigins: process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : undefined,
	database: drizzleAdapter(db, {
		provider: 'sqlite',
		schema: {user: schema.user, session: schema.session, account: schema.account, verification: schema.verification},
	}),
	emailAndPassword: {enabled: true, minPasswordLength: 8},
	socialProviders: google,
	session: {expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24},
	plugins: [nextCookies()],
});

export const googleEnabled = Boolean(google);

// Per-request memoized session lookup for Server Components / actions / route handlers.
export const getSession = cache(async () => auth.api.getSession({headers: await headers()}));

export async function requireUser() {
	const s = await getSession();
	if (!s) redirect('/sign-in');
	return s.user;
}
