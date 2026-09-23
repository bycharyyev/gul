import * as Sentry from "@sentry/nestjs";

// Imported as the very first line of main.ts, before any other module -- Sentry's Node SDK
// patches things (http, the database driver) that need to be patched before those modules are
// first required, not after.
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    initialScope: { tags: { app: "api" } },
  });
}
