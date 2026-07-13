import "@testing-library/jest-dom/vitest"

process.env["PLAYWRIGHT_TEST"] = "true"
process.env["TOKEN_ENCRYPTION_KEY"] = Buffer.alloc(32, 11).toString("base64")
