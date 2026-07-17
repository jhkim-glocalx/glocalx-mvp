import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..")

// Both apps and the global setup must open the SAME stub SQLite file —
// the cross-app harness exists to prove one database serves two apps.
export const crossDatabasePath = join(repoRoot, ".glocalx", "e2e-cross.db")

export const ownerPort = 3010
export const adminPort = 3110
export const ownerBaseUrl = `http://127.0.0.1:${ownerPort}`
export const adminBaseUrl = `http://127.0.0.1:${adminPort}`

export const e2eAdminEmail = "e2e-admin@glocalx.dev"
export const e2eAdminPassword = "e2e-admin-passphrase"

export const e2eTokenEncryptionKey = Buffer.alloc(32, 11).toString("base64")

export const sharedServerEnv = {
  APP_INTEGRATION_MODE: "stub",
  GLOCALX_DB_PATH: crossDatabasePath,
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  KAKAO_CLIENT_SECRET: "",
  KAKAO_REST_API_KEY: "",
  PLAYWRIGHT_TEST: "true",
  TOKEN_ENCRYPTION_KEY: e2eTokenEncryptionKey,
}
