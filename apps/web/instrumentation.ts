import * as Sentry from "@sentry/nextjs";

// Next.js calls this once, in both the Node.js server runtime and the Edge runtime, before
// anything else in the app -- the one place server-side Sentry can be initialized without every
// route needing to import it itself.
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      initialScope: { tags: { app: "web" } },
    });
  }
}

// Reports the errors Next.js's own server-side request handling catches (a Server Component or
// Route Handler throwing) that never reach a React error boundary at all.
export const onRequestError = Sentry.captureRequestError;
