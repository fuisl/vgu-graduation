import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Tokens must never reach logs: all output goes through src/log.ts.
      "no-console": "error",
    },
  },
  {
    files: ["src/log.ts"],
    rules: { "no-console": "off" },
  },
);
