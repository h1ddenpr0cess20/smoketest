import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  globalIgnores([
    ".next/**",
    "coverage/**",
    "out/**",
    "next-env.d.ts",
    "electron/**",
    "scripts/**",
  ]),
]);
