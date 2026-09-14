"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Next.js's own required shape for catching an error thrown by the root layout itself (a normal
// error.tsx can't -- it can only catch errors below the layout that renders it). Replaces the
// whole document while it's showing, so it renders its own <html>/<body>.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
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
