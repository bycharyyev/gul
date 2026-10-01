"use client";

import { useEffect } from "react";
import { loadSentry } from "@/lib/sentry-client";

// Next.js's own required shape for catching an error thrown by the root layout itself (a normal
// error.tsx can't -- it can only catch errors below the layout that renders it). Replaces the
// whole document while it's showing, so it renders its own <html>/<body>.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    // Loads and initialises the SDK if the deferred startup hadn't yet -- a root-layout crash can
    // happen before the page ever reaches its idle moment.
    void loadSentry().then((Sentry) => Sentry?.captureException(error));
  }, [error]);

  return (
    <html lang="ru">
      <body>
        <div style={{ padding: "4rem 1rem", textAlign: "center", fontFamily: "sans-serif" }}>
          <p>Что-то пошло не так. Обновите страницу.</p>
        </div>
      </body>
    </html>
  );
}
