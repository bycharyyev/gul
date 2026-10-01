import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // nginx already strips X-Powered-By (S-13); this stops Next sending it in the first place, so it
  // stays hidden if the container is ever reached without that proxy in front.
  poweredByHeader: false,
  transpilePackages: ["@topup-hub/api-client", "@topup-hub/types", "@topup-hub/i18n"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  output: "standalone",
  images: {
    // Only our own public upload bucket -- keep in sync with OPTIMIZABLE_HOSTS in
    // components/ui/image-with-fallback.tsx. Anything wider turns /_next/image into an open proxy.
    remotePatterns: [{ protocol: "https", hostname: "open.s3.regru.cloud", pathname: "/**" }],
    formats: ["image/avif", "image/webp"],
    // Uploads get a fresh UUID filename and are never overwritten in place, so a long cache is safe.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
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
