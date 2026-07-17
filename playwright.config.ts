import { defineConfig, devices } from "@playwright/test"

import {
  adminBaseUrl,
  adminPort,
  ownerBaseUrl,
  ownerPort,
  sharedServerEnv,
} from "./tests/e2e-cross/harness"

// Cross-app harness: owner-app and admin run together against ONE stub
// SQLite file. Single-app suites stay under apps/owner-app (npm run e2e);
// this config only owns tests/e2e-cross/.
export default defineConfig({
  testDir: "./tests/e2e-cross",
  fullyParallel: false,
  globalSetup: "./tests/e2e-cross/global-setup.ts",
  reporter: [["list"]],
  workers: 1,
  use: {
    baseURL: adminBaseUrl,
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
  webServer: [
    {
      command: `npx next dev --hostname 127.0.0.1 --port ${ownerPort}`,
      cwd: "./apps/owner-app",
      env: sharedServerEnv,
      url: ownerBaseUrl,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx next dev --hostname 127.0.0.1 --port ${adminPort}`,
      cwd: "./apps/admin",
      env: sharedServerEnv,
      url: `${adminBaseUrl}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
