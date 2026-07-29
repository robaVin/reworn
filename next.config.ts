import type { NextConfig } from 'next';

/**
 * Narrowly allow next/image to optimize ONLY the exact Supabase project host and
 * the signed-object storage path — no wildcard hosts, no other paths. Derived
 * from the configured project URL; empty (images unoptimized) if unset.
 */
function supabaseImagePatterns(): NonNullable<
  NextConfig['images']
>['remotePatterns'] {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [];
  try {
    const host = new URL(url).hostname;
    return [
      {
        protocol: 'https',
        hostname: host,
        pathname: '/storage/v1/object/sign/**',
      },
    ];
  } catch {
    return [];
  }
}

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
    // Listing images are served from Supabase Storage via signed URLs. Only the
    // exact project host + signed-object path is allowed (see helper above).
    remotePatterns: supabaseImagePatterns(),
  },
};

export default nextConfig;
