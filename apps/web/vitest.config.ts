import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig says jsx: "preserve" because Next compiles JSX itself; tests need it compiled here.
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    env: { NEXT_PUBLIC_API_URL: "https://api.test/api" },
  },
});
