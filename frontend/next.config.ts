import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const devProxy: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://localhost:8000/api/:path*" }];
  },
};

const nextConfig: NextConfig = {
  ...(isDev ? devProxy : { output: "export" }),
  images: { unoptimized: true },
  compress: false,
  agentRules: false,
};
export default nextConfig;
