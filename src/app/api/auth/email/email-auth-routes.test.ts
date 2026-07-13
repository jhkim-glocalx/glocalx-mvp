import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { authSessionCookieName } from "@/auth/session"
import {
  applyMigrations,
  openDatabase,
  resetDatabaseFile,
} from "@/server/db/sqlite"

import { POST as login } from "./login/route"
import { POST as register } from "./register/route"

const origin = "http://localhost:3000"
const tempPaths: string[] = []

function createFormRequest(
  path: string,
  form: Readonly<Record<string, string>>,
  requestOrigin: string = origin
): NextRequest {
  return new NextRequest(`${origin}${path}`, {
    body: new URLSearchParams(form),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: requestOrigin,
    },
    method: "POST",
  })
}

async function createTestDatabase(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "glocalx-email-auth-route-"))
  tempPaths.push(directory)
  const databasePath = join(directory, "auth.db")
  vi.stubEnv("GLOCALX_DB_PATH", databasePath)
  resetDatabaseFile(databasePath)
  const database = openDatabase(databasePath)
  try {
    applyMigrations(database)
  } finally {
    database.close()
  }
}

async function registerOwner(): Promise<Response> {
  return register(
    createFormRequest("/api/auth/email/register", {
      displayName: "글로컬 사장님",
      email: "owner@example.com",
      password: "correct-horse-battery-staple",
    })
  )
}

describe("email authentication routes", () => {
  beforeEach(createTestDatabase)

  afterEach(async () => {
    vi.unstubAllEnvs()
    for (const directory of tempPaths.splice(0)) {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it("creates an opaque session after same-origin registration", async () => {
    const response = await registerOwner()

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/onboarding")
    expect(response.headers.get("Set-Cookie")).toContain(
      `${authSessionCookieName}=`
    )
    expect(response.headers.get("Set-Cookie")).not.toContain(
      "glocalx_demo_session"
    )
  })

  it("rejects cross-origin registration without issuing a session", async () => {
    const response = await register(
      createFormRequest(
        "/api/auth/email/register",
        {
          displayName: "글로컬 사장님",
          email: "owner@example.com",
          password: "correct-horse-battery-staple",
        },
        "https://attacker.example"
      )
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe(
      "/register?auth_error=invalid_request"
    )
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })

  it("keeps failed login responses generic and relative", async () => {
    await registerOwner()

    const response = await login(
      createFormRequest("/api/auth/email/login", {
        email: "owner@example.com",
        password: "wrong-password-value",
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe(
      "/login?auth_error=invalid_credentials"
    )
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })

  it("does not disclose duplicate registration through the redirect code", async () => {
    await registerOwner()
    const response = await registerOwner()

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe(
      "/register?auth_error=registration_unavailable"
    )
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })
})
