import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";
import "./index.css";
import "@/lib/sentry";
import App from "./App";
import { Providers } from "@/components/providers";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div style={{ padding: "4rem 1rem", textAlign: "center" }}>
          Что-то пошло не так. Обновите страницу.
        </div>
      }
    >
      <Providers>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </Providers>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
