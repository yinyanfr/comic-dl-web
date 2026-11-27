import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    ".husky/_/",
    ".react-router/",
    "build/",
    "coverage/",
    "playwright-report/",
    "test-results/",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["app/**/*.{jsx,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },
  prettier,
);
