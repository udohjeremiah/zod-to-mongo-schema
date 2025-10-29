import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import eslintPluginSimpleImportSort from "eslint-plugin-simple-import-sort";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    plugins: { js, "simple-import-sort": eslintPluginSimpleImportSort },
    extends: ["js/recommended"],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
    },
    ignores: ["node_modules/", "dist/", "coverage/"],
  },
  tseslint.configs.recommended,
  eslintPluginUnicorn.configs.recommended,
  eslintConfigPrettier,
]);
