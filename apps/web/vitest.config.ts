import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next compiles JSX with the automatic runtime; make component tests do the same.
  esbuild: { jsx: "automatic" },
  // Pages read the site language from next/headers (#9); outside a request that is English.
  test: { setupFiles: ["./vitest.setup.ts"] },
});
