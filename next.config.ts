import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "http://localhost:3000",
    "hokey-roseann-untestamental.ngrok-free.dev"
  ],
  serverExternalPackages: [
    'import-in-the-middle',
    'require-in-the-middle',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'upbeat-poodle-737.convex.cloud',
      },
      {
        protocol: 'https',
        hostname: '*.convex.cloud',
      },
    ],
  },
};


export default nextConfig;
