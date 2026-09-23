import * as Sentry from "@sentry/react";

// Baked in at build time via Docker build-args (see Dockerfile + deploy.yml), same pattern as
// VITE_API_URL -- a DSN isn't a secret (it's meant to end up in a public client bundle), but
// it's still specific to this deployment rather than committed.
const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    initialScope: { tags: { app: "admin" } },
  });
}
