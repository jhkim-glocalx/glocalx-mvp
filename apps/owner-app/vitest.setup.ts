import "@testing-library/jest-dom/vitest"

process.env["PLAYWRIGHT_TEST"] = "true"
process.env["TOKEN_ENCRYPTION_KEY"] = Buffer.alloc(32, 11).toString("base64")
process.env["MIGRATION_EXPORT_ENCRYPTION_KEY"] = Buffer.alloc(32, 12).toString(
  "base64"
)
