process.env["PLAYWRIGHT_TEST"] = "true"
process.env["MIGRATION_EXPORT_ENCRYPTION_KEY"] = Buffer.alloc(32, 12).toString(
  "base64"
)
