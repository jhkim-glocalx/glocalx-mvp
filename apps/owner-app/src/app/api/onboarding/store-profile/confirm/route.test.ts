import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  demoStoreId,
  demoUserId,
} from "@/auth/session"
import type { ConfirmedStoreProfile } from "@/domain/schemas"
import {
  applyMigrations,
  openDatabase,
  resetDatabaseFile,
  seedDemoData,
} from "@glocalx/db/sqlite"

import { POST } from "./route"

const testDatabasePath = ".glocalx/onboarding-store-profile-route.test.db"

const confirmedProfile = {
  address: "서울 마포구 양화로 19",
  category: "라멘",
  hours: "11:00 ~ 22:00",
  name: "라멘하우스 합정점",
  naverPlaceUrl: "https://naver.me/ramenhouse",
  phone: "02-987-6543",
  source: "NAVER_LOCAL",
  sourceInput: "https://naver.me/ramenhouse",
} satisfies ConfirmedStoreProfile

function createConfirmRequest(cookieHeader: string): NextRequest {
  return new NextRequest(
    "http://localhost:3000/api/onboarding/store-profile/confirm",
    {
      body: JSON.stringify(confirmedProfile),
      headers: {
        Cookie: cookieHeader,
        "Content-Type": "application/json",
      },
      method: "POST",
    }
  )
}

beforeEach(() => {
  vi.stubEnv("GLOCALX_DB_PATH", testDatabasePath)
  resetDatabaseFile(testDatabasePath)
  const database = openDatabase(testDatabasePath)
  try {
    applyMigrations(database)
    seedDemoData(database)
  } finally {
    database.close()
  }
})

afterEach(() => {
  resetDatabaseFile(testDatabasePath)
  vi.unstubAllEnvs()
})

describe("onboarding store profile confirmation route", () => {
  it("preserves auth-required response when cookie store and session owner do not match", async () => {
    // Given: a session cookie is present, but the store cookie is not owned by that user.
    const request = createConfirmRequest(
      `${demoSessionCookieName}=${demoUserId}; ${demoStoreCookieName}=missing-store`
    )

    // When: the owner attempts to confirm onboarding profile data.
    const response = await POST(request)

    // Then: the route keeps the existing invalid session-pair contract.
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      message: "로그인이 필요합니다.",
      status: "AUTH_REQUIRED",
    })
  })

  it("confirms a valid session store profile with the existing JSON shape", async () => {
    // Given: a valid owner/store cookie pair.
    const request = createConfirmRequest(
      `${demoSessionCookieName}=${demoUserId}; ${demoStoreCookieName}=${demoStoreId}`
    )

    // When: the owner confirms the profile.
    const response = await POST(request)

    // Then: the public route response remains unchanged.
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      extractionId: "confirmed-extraction-demo-store",
      message: "매장 정보를 확인했습니다. GBP 세팅을 진행할 수 있습니다.",
      status: "CONFIRMED",
    })
  })
})
