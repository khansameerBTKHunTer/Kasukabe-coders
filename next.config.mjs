import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/** @param {string} phase @returns {import('next').NextConfig} */
const nextConfig = (phase) => ({
  // Keep dev's incremental output away from the build used by `next start`.
  // Vercel's Next.js adapter expects the standard cloud build directory.
  distDir: process.env.VERCEL || phase === PHASE_DEVELOPMENT_SERVER ? '.next' : '.next-production',
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'geolocation=(self), microphone=(self), camera=()' },
    ] }, { source: '/api/:path*', headers: [
      { key: 'Cache-Control', value: 'private, no-store' },
    ] }];
  },
});

export default nextConfig;
