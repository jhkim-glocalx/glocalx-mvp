import { defineConfig, devices } from "@playwright/test"

const e2ePort = process.env["PLAYWRIGHT_PORT"] ?? "3000"
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`
const e2eWebServerCommand =
  process.env["PLAYWRIGHT_WEB_SERVER_COMMAND"] ??
  `APP_INTEGRATION_MODE=stub npm run dev -- --hostname 127.0.0.1 --port ${e2ePort}`

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  globalSetup: "./tests/e2e/global-setup.ts",
  reporter: [["list"]],
  workers: 1,
  use: {
    baseURL: e2eBaseUrl,
    channel: "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: {
    command: e2eWebServerCommand,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
