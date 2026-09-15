import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    // Uploads source maps for a readable Sentry stack trace. The plugin itself no-ops without
    // SENTRY_AUTH_TOKEN (e.g. a local build), so it's always safe to include.
    sentryVitePlugin({
      org: "gulyaly",
      project: "gul",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
    }),
  ],
  build: {
    // The plugin needs real source maps to upload -- Vite emits none by default.
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    host: "127.0.0.1",
  },
});
