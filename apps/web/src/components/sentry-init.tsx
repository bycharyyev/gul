"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Baked in at build time via Docker build-args (see Dockerfile + deploy.yml), same pattern as
// NEXT_PUBLIC_GA_ID -- a DSN isn't a secret (it's meant to end up in a public client bundle),
// but it's still specific to this deployment rather than committed.
const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
let initialized = false;

export function SentryInit() {
  useEffect(() => {
    if (!DSN || initialized) return;
    initialized = true;
    Sentry.init({
      dsn: DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      initialScope: { tags: { app: "web" } },
    });
  }, []);

  return null;
}
