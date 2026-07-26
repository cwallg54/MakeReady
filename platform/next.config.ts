import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  experimental: {
    // Order attachments (art/mockups) upload through server actions.
    serverActions: { bodySizeLimit: "20mb" },
    // Tree-shake heavy named-import libraries into only what's used.
    optimizePackageImports: ["drizzle-orm", "luxon", "@simplewebauthn/browser"],
  },
};

export default nextConfig;
