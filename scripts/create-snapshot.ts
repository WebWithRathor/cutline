// Runs in the Vercel build (see vercel.json): bundles the Remotion project into a fresh sandbox and
// snapshots it, so renders start fast. Requires BLOB_READ_WRITE_TOKEN and Vercel Sandbox access (OIDC).
import {execSync} from 'node:child_process';
import {addBundleToSandbox, createSandbox} from '@remotion/vercel';
import {saveSnapshotId} from '../src/server/sandbox';

const BUNDLE_DIR = '.remotion';

async function main() {
	console.log('[create-snapshot] bundling Remotion project');
	execSync(`node_modules/.bin/remotion bundle src/remotion/index.ts --out-dir ./${BUNDLE_DIR}`, {stdio: 'inherit'});
	const sandbox = await createSandbox({onProgress: ({progress, message}) => console.log(`[create-snapshot] ${message} (${Math.round(progress * 100)}%)`)});
	console.log('[create-snapshot] adding bundle');
	await addBundleToSandbox({sandbox, bundleDir: BUNDLE_DIR});
	console.log('[create-snapshot] taking snapshot');
	const {snapshotId} = await sandbox.snapshot({expiration: 0});
	await saveSnapshotId(snapshotId);
	console.log(`[create-snapshot] saved ${snapshotId}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
