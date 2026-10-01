"use client";

import { useEffect } from "react";
import { loadSentry } from "@/lib/sentry-client";

/**
 * Starts Sentry once the page has loaded and the browser is idle, instead of on the critical path
 * (see lib/sentry-client.ts). Errors thrown before the SDK arrives are buffered and reported as
 * soon as it does, so deferring the load doesn't mean losing the earliest -- often the most
 * interesting -- failures.
 */
export function SentryInit() {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

    const early: unknown[] = [];
    const onError = (event: ErrorEvent) => early.push(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => early.push(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    const stopBuffering = () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };

    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: number | undefined;

    const start = () => {
      void loadSentry().then((Sentry) => {
        stopBuffering();
        if (cancelled || !Sentry) return;
        for (const error of early) Sentry.captureException(error);
      });
    };
    const schedule = () => {
      // Safari has no requestIdleCallback.
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(start, { timeout: 5000 });
      }
      else timeoutId = window.setTimeout(start, 1500);
    };

    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
      // Dev StrictMode mounts effects twice; loadSentry() itself is idempotent.
      cancelled = true;
      stopBuffering();
      window.removeEventListener("load", schedule);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  return null;
}
