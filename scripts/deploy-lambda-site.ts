// Bundles the Remotion compositions and uploads them as a Remotion Lambda "site".
// Run once by hand (npm run deploy:site) and on every production Vercel build, so renders use current code.
// The site URL stays the same across deploys; put it in REMOTION_SERVE_URL.
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {deploySiteFromBundle, getOrCreateBucket, type AwsRegion} from '@remotion/lambda';

const SITE = process.env.REMOTION_SITE_NAME || 'cutline';

async function main() {
	if (!process.env.REMOTION_AWS_ACCESS_KEY_ID) {
		console.log('[lambda-site] REMOTION_AWS_ACCESS_KEY_ID not set, skipping site deploy');
		return;
	}
	if (process.env.VERCEL && process.env.VERCEL_ENV !== 'production') {
		console.log('[lambda-site] preview build, keeping the production site');
		return;
	}
	const region = (process.env.REMOTION_AWS_REGION || 'us-east-1') as AwsRegion;
	console.log('[lambda-site] bundling');
	const bundleDir = await bundle({entryPoint: path.resolve('src/remotion/index.ts')});
	const {bucketName} = await getOrCreateBucket({region});
	const {serveUrl} = await deploySiteFromBundle({bucketName, region, bundleDir, siteName: SITE, privacy: 'no-acl'});
	console.log(`[lambda-site] deployed: ${serveUrl}`);
	if (process.env.REMOTION_SERVE_URL && process.env.REMOTION_SERVE_URL !== serveUrl) console.warn(`[lambda-site] REMOTION_SERVE_URL differs: set it to ${serveUrl}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
