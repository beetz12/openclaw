import type { NextConfig } from "next";
import { resolve } from "node:path";

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:19001";

const nextConfig: NextConfig = {
  transpilePackages: ["@vwp/theme"],
  outputFileTracingRoot: resolve(__dirname, "../.."),
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
