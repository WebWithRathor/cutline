import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
	// Nearly every page is per-user, so pages render at request time (Cache Components off).
	turbopack: {
		rules: {
			'*.css': {
				loaders: ['@tailwindcss/turbopack'],
				as: '*.css',
			},
		},
	},
	// Rendering/bundling packages run in the worker; keep them out of the server bundle.
	serverExternalPackages: ['@remotion/bundler', '@remotion/renderer', '@remotion/vercel', '@vercel/sandbox', '@libsql/client'],
};

export default nextConfig;
