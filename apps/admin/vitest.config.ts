import path from "node:path";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts on purpose: tests need the "@" alias, not the Sentry upload plugin.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
