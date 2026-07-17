import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

const eslintConfig = [
  {
    ignores: ["02_assets/**", "**/.next/**", "**/test-results/**"],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    settings: {
      next: {
        rootDir: "apps/owner-app/",
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
]

export default eslintConfig
