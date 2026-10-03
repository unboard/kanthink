import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  // Prevent mobile browsers (especially Safari) from caching API responses.
  // Without explicit Cache-Control headers, Safari aggressively caches GET
  // responses and serves stale data even after hard refresh.
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      {
        // The app kit is imported as a module by sandboxed app iframes, whose
        // origin is opaque. Module scripts are fetched with CORS, so without this
        // every styled app would fail to load its components.
        source: '/kit/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cache-Control', value: 'public, max-age=600, stale-while-revalidate=86400' },
        ],
      },
    ]
  },
};

export default nextConfig;
