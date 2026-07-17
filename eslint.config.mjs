import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored by scripts/sync-pdfjs.mjs — minified, not source we own.
    "public/pdfjs/**",
    // Vendored by scripts/sync-pyodide.mjs — same reason.
    "public/pyodide/**",
  ]),
]);

export default eslintConfig;
