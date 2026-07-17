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
} from "@glocalx/db/sqlite"

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

  it("rate limits repeated login attempts before password work", async () => {
    // Given: an existing account and repeated invalid credentials from one client.
    await registerOwner()
    const responses = []

    // When: the client exhausts the login attempt window.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      responses.push(
        await login(
          createFormRequest("/api/auth/email/login", {
            email: "owner@example.com",
            password: "wrong-password-value",
          })
        )
      )
    }

    // Then: allowed attempts stay generic and the next request is load-shed.
    expect(responses.slice(0, 5).map((response) => response.status)).toEqual([
      303, 303, 303, 303, 303,
    ])
    expect(responses[5]?.status).toBe(429)
    const retryAfter = Number(responses[5]?.headers.get("Retry-After"))
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(900)
    expect(responses[5]?.headers.get("Set-Cookie")).toBeNull()
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

  it("rate limits repeated registration attempts before password hashing", async () => {
    // Given: an existing address repeatedly submitted from one client.
    await registerOwner()
    const responses = []

    // When: the client exhausts the registration attempt window.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      responses.push(await registerOwner())
    }

    // Then: duplicate responses remain generic until further work is blocked.
    expect(responses.slice(0, 3).map((response) => response.status)).toEqual([
      303, 303, 303,
    ])
    expect(responses[3]?.status).toBe(429)
    const retryAfter = Number(responses[3]?.headers.get("Retry-After"))
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(3600)
    expect(responses[3]?.headers.get("Set-Cookie")).toBeNull()
  })

  it("preserves the client limit across successful registrations", async () => {
    // Given: one client registering distinct valid accounts.
    const responses = []

    // When: the client exceeds the registration-wide attempt budget.
    for (let attempt = 0; attempt < 11; attempt += 1) {
      responses.push(
        await register(
          createFormRequest("/api/auth/email/register", {
            displayName: `Owner ${attempt}`,
            email: `owner-${attempt}@example.com`,
            password: "correct-horse-battery-staple",
          })
        )
      )
    }

    // Then: successful accounts do not reset the shared client bucket.
    expect(responses.slice(0, 10).map((response) => response.status)).toEqual(
      Array.from({ length: 10 }, () => 303)
    )
    expect(responses[10]?.status).toBe(429)
  })
})
