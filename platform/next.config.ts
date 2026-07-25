import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Order attachments (art/mockups) upload through server actions.
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
