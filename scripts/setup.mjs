// One-time local setup: writes .env.local (with fresh secrets) and creates the database tables.
// Usage: npm run setup
import {execSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {createInterface} from 'node:readline/promises';

const ENV = '.env.local';
const secret = () => randomBytes(32).toString('base64');

async function ask(question) {
	if (process.env.CUTLINE_DATABASE_URL) return process.env.CUTLINE_DATABASE_URL;
	const rl = createInterface({input: process.stdin, output: process.stdout});
	const answer = (await rl.question(question)).trim();
	rl.close();
	return answer;
}

// Supabase's pooler serves session mode on 5432 and transaction mode on 6543 (same host).
function poolerUrls(url) {
	const u = new URL(url);
	if (!u.hostname.endsWith('pooler.supabase.com')) return {app: url, direct: url};
	const tx = new URL(url);
	tx.port = '6543';
	const session = new URL(url);
	session.port = '5432';
	return {app: tx.toString(), direct: session.toString()};
}

async function main() {
	let env = existsSync(ENV) ? readFileSync(ENV, 'utf8') : '';
	const has = (k) => new RegExp(`^${k}=.+`, 'm').test(env);
	const set = (k, v) => {
		env = has(k) || new RegExp(`^${k}=`, 'm').test(env) ? env.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`) : `${env}${env.endsWith('\n') || !env ? '' : '\n'}${k}=${v}\n`;
	};

	if (!has('DATABASE_URL')) {
		console.log('\nPaste your Supabase connection string.');
		console.log('Supabase → your project → Connect → "Transaction pooler" (or "Session pooler"). Replace [YOUR-PASSWORD] with your database password.\n');
		const url = await ask('Connection string: ');
		if (!/^postgres(ql)?:\/\//.test(url) || url.includes('[YOUR-PASSWORD]')) {
			console.error('\nThat does not look like a complete postgres:// connection string. Run npm run setup again.');
			process.exit(1);
		}
		const {app, direct} = poolerUrls(url);
		set('DATABASE_URL', app);
		set('DATABASE_URL_DIRECT', direct);
	}
	for (const k of ['BETTER_AUTH_SECRET', 'ENCRYPTION_KEY', 'FILE_URL_SECRET']) if (!has(k)) set(k, secret());
	if (!has('BETTER_AUTH_URL')) set('BETTER_AUTH_URL', 'http://localhost:3000');
	if (!has('APP_URL')) set('APP_URL', 'http://localhost:3000');
	if (!has('STORAGE_DIR')) set('STORAGE_DIR', './storage');
	writeFileSync(ENV, env);
	console.log(`\n✓ ${ENV} ready (secrets generated; keep this file private).`);

	console.log('Creating database tables…');
	const vars = Object.fromEntries(
		env
			.split('\n')
			.map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
			.filter(Boolean)
			.map((m) => [m[1], m[2].replace(/\s+#.*$/, '')]),
	);
	execSync('npx drizzle-kit migrate', {stdio: 'inherit', env: {...process.env, ...vars}});
	console.log('\n✓ Done. Start everything with:  npm run local\n  Then open http://localhost:3000\n');
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
