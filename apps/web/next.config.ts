import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@topup-hub/api-client", "@topup-hub/types", "@topup-hub/i18n"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  output: "standalone",
};

export default nextConfig;
