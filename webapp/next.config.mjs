/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The FastAPI backend is on 8001 through the `/api/*` proxy in the container.
  // During `next dev` we reach it at the same origin via rewrites → localhost:8001.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8001/api/:path*',
      },
    ];
  },
  experimental: {
    // App-router defaults are fine; nothing custom for MVP.
  },
};

export default nextConfig;
