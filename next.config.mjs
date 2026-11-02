import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The simulator owns a single WebGL context and global input listeners;
  // StrictMode's double-mount in development would start it twice.
  reactStrictMode: false,
  agentRules: false,
  turbopack: { root: dirname(fileURLToPath(import.meta.url)) },
};

export default nextConfig;
