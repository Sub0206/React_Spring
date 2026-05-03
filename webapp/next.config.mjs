/** @type {import('next').NextConfig} */
//
// Backend origin:
//   • In dev (container)     → http://localhost:8001 (FastAPI)
//   • In preview on Vercel   → set env var LENDIQ_API_ORIGIN=<https://your-backend>
//     e.g. https://lending-hub-63.preview.emergentagent.com
//   • In production          → same as above, point it at your live FastAPI host.
//
// The webapp always calls `/api/*` client-side; Next.js rewrites them server-side
// so CORS is never an issue and tokens stay attached to the same origin.
const BACKEND_ORIGIN =
  process.env.LENDIQ_API_ORIGIN ||
  process.env.NEXT_PUBLIC_LENDIQ_API_ORIGIN ||
  'http://localhost:8001';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
    ];
  },
  experimental: {
    // App-router defaults are fine; nothing custom for MVP.
  },
};

export default nextConfig;
