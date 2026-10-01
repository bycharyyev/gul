import type * as SentrySdk from "@sentry/nextjs";

// Baked in at build time via Docker build-args (see Dockerfile + deploy.yml), same pattern as
// NEXT_PUBLIC_GA_ID -- a DSN isn't a secret (it's meant to end up in a public client bundle),
// but it's still specific to this deployment rather than committed.
const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

let loading: Promise<typeof SentrySdk | null> | null = null;

/**
 * Loads the browser SDK as its own chunk and initialises it once; null when no DSN is configured.
 *
 * Imported dynamically on purpose: statically it was ~165 KB of JS (52 KB gzipped) every visitor
 * downloaded and parsed before the page could paint, for a tool that only matters once something
 * breaks. Everything on the client that reports to Sentry goes through here so nothing pulls the
 * SDK back into the main bundle.
 */
export function loadSentry(): Promise<typeof SentrySdk | null> {
  if (!DSN) return Promise.resolve(null);
  loading ??= import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.init({
        dsn: DSN,
        environment: process.env.NODE_ENV,
        tracesSampleRate: 0.1,
        initialScope: { tags: { app: "web" } },
      });
      return Sentry;
    })
    .catch(() => {
      // A chunk that failed to load (flaky network, or replaced by a deploy) may be retried later.
      loading = null;
      return null;
    });
  return loading;
}
