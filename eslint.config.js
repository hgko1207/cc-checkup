import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "release",
      "test-results",
      "playwright-report",
      "src/templates",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
