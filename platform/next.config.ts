import type { NextConfig } from "next";

// Baseline security headers applied to every response (CSP is set per-request
// in proxy.ts because it carries a per-request nonce).
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  experimental: {
    // Order attachments (art/mockups) upload through server actions.
    serverActions: { bodySizeLimit: "20mb" },
    // Tree-shake heavy named-import libraries into only what's used.
    optimizePackageImports: ["drizzle-orm", "luxon", "@simplewebauthn/browser"],
  },
};

export default nextConfig;
