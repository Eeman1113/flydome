import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// GitHub Pages serves the project under /<repo>; the deploy workflow sets NEXT_PUBLIC_BASE_PATH=/flydome.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static site: the simulator runs entirely in the browser.
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  // The simulator owns a single WebGL context and global input listeners;
  // StrictMode's double-mount in development would start it twice.
  reactStrictMode: false,
  agentRules: false,
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
