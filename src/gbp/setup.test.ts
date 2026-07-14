import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { createIntegrationAdapters } from "@/integrations"
import type { IntegrationAdapters } from "@/integrations/contracts"
import { applyMigrations, openDatabase, seedDemoData } from "@/server/db/sqlite"

import { handleGoogleOAuthCallback } from "./oauth-callback"
import {
  buildClaimRequiredResult,
  setupGoogleBusinessProfile,
  type SetupGoogleBusinessProfileOptions,
} from "./setup"

const setupRowsSchema = z.object({
  oauthConnections: z.number(),
  gbpLocations: z.number(),
  followUpJobs: z.number(),
  auditLogs: z.number(),
})

const oauthRowSchema = z.object({
  encrypted_access_token: z.string(),
  subject_id: z.string(),
})

const locationBodySchema = z.object({
  languageCode: z.literal("ko"),
  phoneNumbers: z.object({
    primaryPhone: z.string(),
  }),
  storeCode: z.string(),
  storefrontAddress: z.object({
    addressLines: z.array(z.string()),
    regionCode: z.literal("KR"),
  }),
  title: z.string(),
})

describe("setupGoogleBusinessProfile", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  async function createDatabase() {
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-gbp-setup-"))
    tempPaths.push(tempPath)
    const database = openDatabase(join(tempPath, "gbp.db"))
    applyMigrations(database)
    seedDemoData(database)
    return database
  }

  function createCapturedLocationAdapters(
    baseAdapters: IntegrationAdapters,
    captureLocation: (location: Readonly<Record<string, unknown>>) => void
  ): IntegrationAdapters {
    return {
      ...baseAdapters,
      gbpBusinessInformation: {
        ...baseAdapters.gbpBusinessInformation,
        async createLocation(input) {
          captureLocation(input.location)
          return await baseAdapters.gbpBusinessInformation.createLocation(input)
        },
      },
    }
  }

  async function reviewAndConfirm(
    options: Omit<SetupGoogleBusinessProfileOptions, "reviewToken">
  ) {
    const review = await setupGoogleBusinessProfile(options)
    if (review.status !== "REGISTRATION_REVIEW_REQUIRED") {
      throw new Error(`Expected registration review, received ${review.status}`)
    }
    return setupGoogleBusinessProfile({
      ...options,
      reviewToken: review.reviewToken,
    })
  }

  it("creates demo OAuth, GBP location, follow-up job, and audit log records", async () => {
    // Given
    const database = await createDatabase()
    const adapters = createIntegrationAdapters({ database, env: {} })

    // When
    const result = await reviewAndConfirm({
      adapters,
      database,
      mode: "stub",
      storeId: "demo-store",
    })

    // Then
    expect(result).toEqual({
      status: "VERIFICATION_PENDING",
      googleLocationId: "locations/stub-created",
      oauthConnectionId: "setup-oauth-google",
      gbpLocationId: "setup-gbp-location",
      followUpJobId: "setup-gbp-follow-up",
      auditLogId: "setup-gbp-audit",
      message:
        "Google 비즈니스 프로필 생성 요청이 접수되었습니다. 인증 완료까지 기다려주세요.",
    })

    const rows = setupRowsSchema.parse(
      database
        .prepare(
          "SELECT (SELECT COUNT(*) FROM oauth_connections WHERE id = 'setup-oauth-google') AS oauthConnections, (SELECT COUNT(*) FROM gbp_locations WHERE id = 'setup-gbp-location' AND status = 'VERIFICATION_PENDING') AS gbpLocations, (SELECT COUNT(*) FROM job_runs WHERE id = 'setup-gbp-follow-up' AND run_after = '2026-06-11T00:00:00.000Z') AS followUpJobs, (SELECT COUNT(*) FROM audit_logs WHERE id = 'setup-gbp-audit') AS auditLogs"
        )
        .get()
    )
    expect(rows).toEqual({
      oauthConnections: 1,
      gbpLocations: 1,
      followUpJobs: 1,
      auditLogs: 1,
    })
    database.close()
  })

  it("requires an explicit review confirmation before creating a location", async () => {
    const database = await createDatabase()
    const baseAdapters = createIntegrationAdapters({ database, env: {} })
    let createCalls = 0
    const adapters: IntegrationAdapters = {
      ...baseAdapters,
      gbpBusinessInformation: {
        ...baseAdapters.gbpBusinessInformation,
        async createLocation(input) {
          createCalls += 1
          return baseAdapters.gbpBusinessInformation.createLocation(input)
        },
      },
    }

    const review = await setupGoogleBusinessProfile({
      adapters,
      database,
      mode: "stub",
      storeId: "demo-store",
    })

    expect(review).toMatchObject({
      accountDisplayName: "Stub GBP Account",
      businessName: "브런치모먼트 홍대점",
      status: "REGISTRATION_REVIEW_REQUIRED",
    })
    if (review.status !== "REGISTRATION_REVIEW_REQUIRED") {
      throw new Error("Expected registration review")
    }
    expect(createCalls).toBe(0)

    const created = await setupGoogleBusinessProfile({
      adapters,
      database,
      mode: "stub",
      reviewToken: review.reviewToken,
      storeId: "demo-store",
    })
    expect(created.status).toBe("VERIFICATION_PENDING")
    expect(createCalls).toBe(1)

    const replay = await setupGoogleBusinessProfile({
      adapters,
      database,
      mode: "stub",
      reviewToken: review.reviewToken,
      storeId: "demo-store",
    })
    expect(replay).toEqual({
      status: "GOOGLE_API_ERROR",
      message:
        "등록 검토가 만료되었거나 이미 사용되었습니다. 다시 확인해주세요.",
    })
    expect(createCalls).toBe(1)
    database.close()
  })

  it("stops when Google returns multiple accounts", async () => {
    const database = await createDatabase()
    const baseAdapters = createIntegrationAdapters({ database, env: {} })
    const adapters: IntegrationAdapters = {
      ...baseAdapters,
      gbpBusinessInformation: {
        ...baseAdapters.gbpBusinessInformation,
        async listAccounts() {
          return {
            kind: "ok",
            value: {
              accounts: [
                { accountName: "첫 계정", name: "accounts/first" },
                { accountName: "둘째 계정", name: "accounts/second" },
              ],
            },
          }
        },
      },
    }

    const result = await setupGoogleBusinessProfile({
      adapters,
      database,
      mode: "stub",
      storeId: "demo-store",
    })

    expect(result).toEqual({
      status: "GOOGLE_API_ERROR",
      message:
        "여러 Google Business Profile 계정이 있어 자동으로 선택할 수 없습니다.",
    })
    database.close()
  })

  it("rejects a review token when the confirmed profile changes", async () => {
    const database = await createDatabase()
    const adapters = createIntegrationAdapters({ database, env: {} })
    const review = await setupGoogleBusinessProfile({
      adapters,
      database,
      mode: "stub",
      storeId: "demo-store",
    })
    if (review.status !== "REGISTRATION_REVIEW_REQUIRED") {
      throw new Error("Expected registration review")
    }
    database
      .prepare("UPDATE stores SET address = ? WHERE id = ?")
      .run("서울 마포구 변경로 999", "demo-store")

    const result = await setupGoogleBusinessProfile({
      adapters,
      database,
      mode: "stub",
      reviewToken: review.reviewToken,
      storeId: "demo-store",
    })

    expect(result).toEqual({
      status: "GOOGLE_API_ERROR",
      message:
        "등록 검토가 만료되었거나 이미 사용되었습니다. 다시 확인해주세요.",
    })
    database.close()
  })

  it("blocks setup when the store profile has not been confirmed", async () => {
    // Given
    const database = await createDatabase()
    database
      .prepare("DELETE FROM business_profile_extractions WHERE store_id = ?")
      .run("demo-store")
    const adapters = createIntegrationAdapters({ database, env: {} })

    // When
    const result = await setupGoogleBusinessProfile({
      adapters,
      database,
      mode: "stub",
      storeId: "demo-store",
    })

    // Then
    expect(result).toEqual({
      status: "STORE_PROFILE_REQUIRED",
      message: "GBP 세팅 전에 매장 정보를 먼저 확인해주세요.",
    })
    database.close()
  })

  it("uses the confirmed store profile when creating a GBP location", async () => {
    // Given
    const database = await createDatabase()
    database
      .prepare(
        "UPDATE stores SET name = ?, address = ?, phone = ?, category = ?, hours = ? WHERE id = ?"
      )
      .run(
        "라멘하우스 합정점",
        "서울 마포구 양화로 19",
        "02-987-6543",
        "라멘",
        "11:00 ~ 22:00",
        "demo-store"
      )
    let capturedLocation: Readonly<Record<string, unknown>> | undefined
    const baseAdapters = createIntegrationAdapters({ database, env: {} })
    const adapters = createCapturedLocationAdapters(
      baseAdapters,
      (location) => {
        capturedLocation = location
      }
    )

    // When
    const result = await reviewAndConfirm({
      adapters,
      database,
      mode: "stub",
      storeId: "demo-store",
    })

    // Then
    expect(result.status).toBe("VERIFICATION_PENDING")
    const locationBody = locationBodySchema.parse(capturedLocation)
    expect(locationBody).toEqual({
      phoneNumbers: {
        primaryPhone: "02-987-6543",
      },
      languageCode: "ko",
      storeCode: "demo-store",
      storefrontAddress: {
        addressLines: ["서울 마포구 양화로 19"],
        regionCode: "KR",
      },
      title: "라멘하우스 합정점",
    })

    const secondResult = await reviewAndConfirm({
      adapters,
      database,
      mode: "stub",
      storeId: "demo-store",
    })
    expect(secondResult.status).toBe("VERIFICATION_PENDING")

    const rows = setupRowsSchema.parse(
      database
        .prepare(
          "SELECT (SELECT COUNT(*) FROM oauth_connections WHERE id = 'setup-oauth-google') AS oauthConnections, (SELECT COUNT(*) FROM gbp_locations WHERE id = 'setup-gbp-location') AS gbpLocations, (SELECT COUNT(*) FROM job_runs WHERE id = 'setup-gbp-follow-up') AS followUpJobs, (SELECT COUNT(*) FROM audit_logs WHERE id = 'setup-gbp-audit') AS auditLogs"
        )
        .get()
    )
    expect(rows).toEqual({
      auditLogs: 1,
      followUpJobs: 1,
      gbpLocations: 1,
      oauthConnections: 1,
    })
    database.close()
  })

  it("persists claimed Google locations as owner-action follow-up", async () => {
    // Given
    const database = await createDatabase()
    const baseAdapters = createIntegrationAdapters({ database, env: {} })
    const requestAdminRightsUrl =
      "https://business.google.com/request-admin-rights/stub"
    const adapters: IntegrationAdapters = {
      ...baseAdapters,
      gbpBusinessInformation: {
        ...baseAdapters.gbpBusinessInformation,
        async searchLocations() {
          return {
            kind: "ok",
            value: {
              matches: [
                {
                  googleLocationId: "googleLocations/claimed-stub",
                  requestAdminRightsUrl,
                },
              ],
            },
          }
        },
      },
    }

    // When
    const result = await setupGoogleBusinessProfile({
      adapters,
      database,
      mode: "stub",
      storeId: "demo-store",
    })

    // Then
    expect(result).toEqual({
      status: "EXISTING_LOCATION_FOUND",
      googleLocationId: "googleLocations/claimed-stub",
      requestAdminRightsUrl,
      message:
        "기존 Google 비즈니스 프로필 후보를 찾았습니다. 중복 생성을 막기 위해 Google에서 소유권을 먼저 확인해주세요.",
    })
    database.close()
  })

  it("stops on an unclaimed duplicate candidate instead of creating another location", async () => {
    const database = await createDatabase()
    const baseAdapters = createIntegrationAdapters({ database, env: {} })
    let createCalls = 0
    const adapters: IntegrationAdapters = {
      ...baseAdapters,
      gbpBusinessInformation: {
        ...baseAdapters.gbpBusinessInformation,
        async createLocation(input) {
          createCalls += 1
          return baseAdapters.gbpBusinessInformation.createLocation(input)
        },
        async searchLocations() {
          return {
            kind: "ok",
            value: {
              matches: [{ googleLocationId: "googleLocations/unclaimed" }],
            },
          }
        },
      },
    }

    const result = await setupGoogleBusinessProfile({
      adapters,
      database,
      mode: "stub",
      storeId: "demo-store",
    })

    expect(result).toMatchObject({
      googleLocationId: "googleLocations/unclaimed",
      status: "EXISTING_LOCATION_FOUND",
    })
    expect(createCalls).toBe(0)
    database.close()
  })

  it("surfaces claimed Google locations with a Korean owner-action message", () => {
    // Given
    const requestAdminRightsUrl =
      "https://business.google.com/request-admin-rights/stub"

    // When
    const result = buildClaimRequiredResult({
      googleLocationId: "googleLocations/claimed-stub",
      requestAdminRightsUrl,
    })

    // Then
    expect(result).toEqual({
      status: "CLAIM_REQUIRED",
      googleLocationId: "googleLocations/claimed-stub",
      requestAdminRightsUrl,
      followUpRequired: true,
      message:
        "이미 소유자가 있는 Google 비즈니스 프로필입니다. 관리자 권한 요청을 진행해주세요.",
    })
  })

  it("uses the connected owner token and discovered Google account in production", async () => {
    // Given
    const database = await createDatabase()
    const baseAdapters = createIntegrationAdapters({ database, env: {} })
    const calls: string[] = []
    const adapters: IntegrationAdapters = {
      ...baseAdapters,
      mode: "production",
      gbpBusinessInformation: {
        ...baseAdapters.gbpBusinessInformation,
        async listAccounts(input) {
          calls.push(`accounts:${input.accessToken}`)
          return {
            kind: "ok",
            value: {
              accounts: [
                { accountName: "Owner account", name: "accounts/owner-123" },
              ],
            },
          }
        },
        async searchLocations(input) {
          calls.push(`search:${input.accessToken}`)
          return { kind: "ok", value: { matches: [] } }
        },
        async findCategory(input) {
          calls.push(`category:${input.displayName}`)
          return {
            kind: "ok",
            value: {
              category: {
                displayName: input.displayName,
                name: "categories/gcid:brunch_restaurant",
              },
            },
          }
        },
        async validateLocation(input) {
          calls.push(`validate:${input.accountName}`)
          return { kind: "ok", value: undefined }
        },
        async createLocation(input) {
          calls.push(`create:${input.accountName}`)
          return {
            kind: "ok",
            value: { googleLocationId: "locations/live-created" },
          }
        },
      },
    }

    // When
    const result = await reviewAndConfirm({
      adapters,
      connection: {
        accessToken: "owner-access-token",
        expiresAt: "2099-06-04T01:00:00.000Z",
        refreshToken: "owner-refresh-token",
        scopes: ["https://www.googleapis.com/auth/business.manage"],
        subjectId: "google-owner-123",
      },
      database,
      mode: "production",
      storeId: "demo-store",
    })

    // Then
    expect(calls).toEqual([
      "accounts:owner-access-token",
      "search:owner-access-token",
      "category:브런치 카페",
      "validate:accounts/owner-123",
      "accounts:owner-access-token",
      "search:owner-access-token",
      "category:브런치 카페",
      "validate:accounts/owner-123",
      "create:accounts/owner-123",
    ])
    expect(result).toMatchObject({
      googleLocationId: "locations/live-created",
      status: "VERIFICATION_PENDING",
    })
    database.close()
  })

  it("requires Google authorization before production registration", async () => {
    // Given
    const database = await createDatabase()
    database
      .prepare("DELETE FROM oauth_connections WHERE store_id = ?")
      .run("demo-store")
    const adapters = {
      ...createIntegrationAdapters({ database, env: {} }),
      mode: "production",
    } satisfies IntegrationAdapters

    // When
    const result = await setupGoogleBusinessProfile({
      adapters,
      database,
      mode: "production",
      storeId: "demo-store",
    })

    // Then
    expect(result).toEqual({
      status: "GOOGLE_OAUTH_REQUIRED",
      message: "Google 계정을 연결하면 실제 매장 등록을 시작해요.",
    })
    database.close()
  })

  it("requires reconnection instead of using an expired Google access token", async () => {
    const database = await createDatabase()
    const baseAdapters = createIntegrationAdapters({ database, env: {} })
    let accountCalls = 0
    const adapters: IntegrationAdapters = {
      ...baseAdapters,
      mode: "production",
      gbpBusinessInformation: {
        ...baseAdapters.gbpBusinessInformation,
        async listAccounts(input) {
          accountCalls += 1
          return baseAdapters.gbpBusinessInformation.listAccounts(input)
        },
      },
    }

    const result = await setupGoogleBusinessProfile({
      adapters,
      connection: {
        accessToken: "expired-access-token",
        expiresAt: "2026-06-03T00:00:00.000Z",
      },
      database,
      mode: "production",
      storeId: "demo-store",
    })

    expect(result).toEqual({
      status: "GOOGLE_OAUTH_REQUIRED",
      message: "Google 연결이 만료되었습니다. 계정을 다시 연결해주세요.",
    })
    expect(accountCalls).toBe(0)
    database.close()
  })

  it("validates production OAuth state before storing encrypted token placeholders", async () => {
    // Given
    const database = await createDatabase()

    // When
    const invalidResult = handleGoogleOAuthCallback({
      code: "invalid-code",
      database,
      expectedState: "demo-store:google-oauth-state",
      state: "tampered-state",
      storeId: "demo-store",
    })
    const missingPayloadResult = handleGoogleOAuthCallback({
      code: "",
      database,
      expectedState: "demo-store:google-oauth-state",
      state: "",
      storeId: "demo-store",
    })
    const validResult = handleGoogleOAuthCallback({
      code: "valid-code",
      database,
      expectedState: "demo-store:google-oauth-state",
      state: "demo-store:google-oauth-state",
      storeId: "demo-store",
    })

    // Then
    expect(invalidResult).toEqual({
      status: "INVALID_OAUTH_STATE",
      message: "Google OAuth state가 일치하지 않습니다.",
    })
    expect(missingPayloadResult).toEqual({
      status: "INVALID_OAUTH_STATE",
      message: "Google OAuth state가 일치하지 않습니다.",
    })
    expect(validResult).toEqual({
      status: "GOOGLE_OAUTH_CONNECTED",
      oauthConnectionId: "production-oauth-google",
      message: "Google 계정 연결이 저장되었습니다.",
    })

    const oauthRow = oauthRowSchema.parse(
      database
        .prepare(
          "SELECT encrypted_access_token, subject_id FROM oauth_connections WHERE id = 'production-oauth-google'"
        )
        .get()
    )
    expect(oauthRow).toMatchObject({
      subject_id: "production-google-oauth-placeholder",
    })
    expect(oauthRow.encrypted_access_token).toMatch(/^v1:/)
    database.close()
  })
})
