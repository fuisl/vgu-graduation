import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next compiles JSX with the automatic runtime; make component tests do the same.
  esbuild: { jsx: "automatic" },
});
