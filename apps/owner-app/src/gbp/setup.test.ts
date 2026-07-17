import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { createIntegrationAdapters } from "@/integrations"
import type { IntegrationAdapters } from "@/integrations/contracts"
import { applyMigrations, openDatabase, seedDemoData } from "@/server/db/sqlite"

import { handleGoogleOAuthCallback } from "./oauth-callback"
import { buildClaimRequiredResult, setupGoogleBusinessProfile } from "./setup"

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

const claimRequiredRowSchema = z.object({
  request_admin_rights_url: z.string(),
  status: z.literal("CLAIM_REQUIRED"),
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

  it("creates demo OAuth, GBP location, follow-up job, and audit log records", async () => {
    // Given
    const database = await createDatabase()
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
    const result = await setupGoogleBusinessProfile({
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
      storeCode: "demo-store",
      storefrontAddress: {
        addressLines: ["서울 마포구 양화로 19"],
        regionCode: "KR",
      },
      title: "라멘하우스 합정점",
    })

    const secondResult = await setupGoogleBusinessProfile({
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
      status: "CLAIM_REQUIRED",
      googleLocationId: "googleLocations/claimed-stub",
      requestAdminRightsUrl,
      followUpRequired: true,
      message:
        "이미 소유자가 있는 Google 비즈니스 프로필입니다. 관리자 권한 요청을 진행해주세요.",
    })

    const row = claimRequiredRowSchema.parse(
      database
        .prepare(
          "SELECT status, request_admin_rights_url FROM gbp_locations WHERE id = ?"
        )
        .get("setup-gbp-location")
    )
    expect(row).toEqual({
      request_admin_rights_url: requestAdminRightsUrl,
      status: "CLAIM_REQUIRED",
    })
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
