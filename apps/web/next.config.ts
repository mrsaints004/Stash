import type { NextConfig } from "next";
import webpack from "next/dist/compiled/webpack/webpack-lib.js";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  transpilePackages: ["@stash/common", "@stash/abis"],
  async rewrites() {
    return [
      {
        source: "/api/proxy/:path*",
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    // Ignore optional @x402 dependencies pulled in by @coinbase/cdp-sdk
    // These are not needed for client-side wallet connection
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^@x402\//,
      }),
    );
    return config;
  },
};

export default nextConfig;
