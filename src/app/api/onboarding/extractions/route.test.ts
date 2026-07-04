import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  demoStoreId,
  demoUserId,
} from "@/auth/session"
import { applyMigrations, openDatabase, seedDemoData } from "@/server/db/sqlite"
import { POST } from "./route"

const extractionRowSchema = z.object({
  candidateJson: z.string(),
  sourceInput: z.string(),
  status: z.string(),
})

const tempPaths: string[] = []

async function createDatabasePath(): Promise<string> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-extraction-route-"))
  tempPaths.push(tempPath)
  const databasePath = join(tempPath, "route.db")
  const database = openDatabase(databasePath)
  try {
    applyMigrations(database)
    seedDemoData(database)
  } finally {
    database.close()
  }
  return databasePath
}

function createCookieHeader(cookies: Readonly<Record<string, string>>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ")
}

function createExtractionRequest(options: {
  readonly cookies?: Readonly<Record<string, string>>
  readonly input: string
}): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" })
  if (options.cookies !== undefined) {
    headers.set("Cookie", createCookieHeader(options.cookies))
  }

  return new NextRequest("http://localhost:3000/api/onboarding/extractions", {
    body: JSON.stringify({ input: options.input }),
    headers,
    method: "POST",
  })
}

function readCandidateExtraction(databasePath: string, sourceInput: string) {
  const database = openDatabase(databasePath)
  try {
    return extractionRowSchema
      .optional()
      .parse(
        database
          .prepare(
            "SELECT status, source_input AS sourceInput, candidate_json AS candidateJson FROM business_profile_extractions WHERE source_input = ?"
          )
          .get(sourceInput)
      )
  } finally {
    database.close()
  }
}

afterEach(async () => {
  vi.unstubAllEnvs()

  for (const tempPath of tempPaths) {
    await rm(tempPath, { force: true, recursive: true })
  }
  tempPaths.length = 0
})

describe("onboarding extraction route", () => {
  it("persists candidate extraction rows through the queryable route boundary", async () => {
    // Given: a valid owner session reaches the extraction route.
    const databasePath = await createDatabasePath()
    vi.stubEnv("DATABASE_PROVIDER", "sqlite")
    vi.stubEnv("GLOCALX_DB_PATH", databasePath)
    const request = createExtractionRequest({
      cookies: {
        [demoSessionCookieName]: demoUserId,
        [demoStoreCookieName]: demoStoreId,
      },
      input: "서울커피",
    })

    // When: the route returns a deterministic stub candidate.
    const response = await POST(request)

    // Then: the same route call persists the candidate via the Queryable repository.
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      normalizedQuery: "서울커피",
      status: "CANDIDATES_FOUND",
    })
    const row = readCandidateExtraction(databasePath, "서울커피")
    expect(row).toMatchObject({
      sourceInput: "서울커피",
      status: "CANDIDATES_FOUND",
    })
    expect(row?.candidateJson).toContain("서울커피 홍대점")
  })

  it("keeps auth-required response when the session cookie pair is invalid", async () => {
    // Given: the route receives a store cookie that is not owned by the user.
    const databasePath = await createDatabasePath()
    vi.stubEnv("DATABASE_PROVIDER", "sqlite")
    vi.stubEnv("GLOCALX_DB_PATH", databasePath)
    const request = createExtractionRequest({
      cookies: {
        [demoSessionCookieName]: demoUserId,
        [demoStoreCookieName]: "missing-store",
      },
      input: "서울커피",
    })

    // When: candidate extraction is requested.
    const response = await POST(request)

    // Then: the public invalid-session contract is preserved.
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      message: "로그인이 필요합니다.",
      status: "AUTH_REQUIRED",
    })
  })
})
