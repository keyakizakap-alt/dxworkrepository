import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", ".wrangler/**", "node_modules/**", "test-results/**", "playwright-report/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": ["warn", { allow: ["error", "log"] }],
    },
  },
  {
    // 管理画面はトーク内容に触れるモジュールを import できない（集計だけを見る）
    files: ["src/admin/**/*.ts", "web/src/admin/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/store/repo", "**/store/crypto", "**/executor/**", "**/line/**", "**/llm/**", "**/build-deps"],
              message: "管理画面からトーク内容・個人情報を扱うモジュールは使えません（metrics だけを使ってください）。",
            },
          ],
        },
      ],
    },
  },
);
