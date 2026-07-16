import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Security: do not advertise the framework/version to attackers.
  poweredByHeader: false,

  // Security headers and the nonce-based CSP are applied in middleware.ts
  // (single source of truth: src/lib/security/headers.ts).

  // Prisma must not be bundled by the server compiler.
  serverExternalPackages: ['@prisma/client', '@prisma/engines'],

  eslint: {
    // CI runs lint as a separate, blocking step. Never silently ignore.
    ignoreDuringBuilds: false,
  },
  typescript: {
    // Never ship a build that does not type-check.
    ignoreBuildErrors: false,
  },

  images: {
    // Product images (Stage 2) will be served from Supabase Storage / CDN.
    // Remote patterns are added explicitly then — no wildcards.
    remotePatterns: [],
  },
};

export default nextConfig;
