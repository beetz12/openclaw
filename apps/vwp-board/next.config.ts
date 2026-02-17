import type { NextConfig } from "next";

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:19001";

const nextConfig: NextConfig = {
  transpilePackages: ["@vwp/theme"],
  async rewrites() {
    return [
      {
        source: "/vwp/:path*",
        destination: `${GATEWAY_URL}/vwp/:path*`,
      },
    ];
  },
};

export default nextConfig;
