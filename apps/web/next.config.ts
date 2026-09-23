import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@topup-hub/api-client", "@topup-hub/types", "@topup-hub/i18n"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  output: "standalone",
};

// Uploads source maps for a readable Sentry stack trace, then strips them back out of the built
// output -- without SENTRY_AUTH_TOKEN (e.g. a local build, or CI before the secret existed) this
// silently no-ops instead of failing the build.
export default withSentryConfig(nextConfig, {
  org: "gulyaly",
  project: "gul",
  silent: true,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  disableLogger: true,
});
