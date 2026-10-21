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
  {
    // 빌드·개발용 Node 스크립트 (CommonJS·ESM)
    files: ["scripts/**/*.{mjs,cjs}"],
    languageOptions: {
      globals: {
        process: "readonly",
        require: "readonly",
        __dirname: "readonly",
        setTimeout: "readonly",
      },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
