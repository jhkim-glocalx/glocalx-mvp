import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { createIntegrationAdapters } from "@glocalx/integrations"
import type { IntegrationAdapters } from "@glocalx/integrations/contracts"
import { applyMigrations, openDatabase, seedDemoData } from "@glocalx/db/sqlite"

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
    // The demo seed hands demo-store a VERIFIED listing, which is exactly what
    // the duplicate guard refuses to provision over. Setup tests are about the
    // *first* provisioning, so start them from a store with no listing yet.
    database.exec("DELETE FROM gbp_locations WHERE store_id = 'demo-store'")
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

  it("refuses to provision over a listing the store already has", async () => {
    // Given a store set up outside the app (the hand-built org-account case):
    // a location row exists but nothing this app did produced it.
    const database = await createDatabase()
    database.exec(
      `INSERT INTO gbp_locations (id, store_id, gbp_account_id, google_location_id, status, request_admin_rights_url, created_at, updated_at)
       VALUES ('manual-location', 'demo-store', 'demo-gbp-account', 'locations/set-up-by-hand', 'VERIFIED', NULL, '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z')`
    )
    let createCalls = 0
    const adapters = createCapturedLocationAdapters(
      createIntegrationAdapters({ database, env: {} }),
      () => {
        createCalls += 1
      }
    )

    // When
    const result = await setupGoogleBusinessProfile({
      adapters,
      database,
      mode: "stub",
      storeId: "demo-store",
    })

    // Then Google is never asked to create anything.
    expect(result).toEqual({
      status: "ALREADY_LINKED",
      googleLocationId: "locations/set-up-by-hand",
      message: "이미 연결된 Google 비즈니스 프로필이 있습니다.",
    })
    expect(createCalls).toBe(0)
    database.close()
  })

  it("hands back the admin-rights link when a claim is still outstanding", async () => {
    // Given a previous run that stopped at CLAIM_REQUIRED
    const database = await createDatabase()
    database.exec(
      `INSERT INTO gbp_locations (id, store_id, gbp_account_id, google_location_id, status, request_admin_rights_url, created_at, updated_at)
       VALUES ('claim-location', 'demo-store', 'demo-gbp-account', 'googleLocations/claimed', 'CLAIM_REQUIRED', 'https://business.google.com/claim/abc', '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z')`
    )
    const adapters = createIntegrationAdapters({ database, env: {} })

    // When the owner retries setup
    const result = await setupGoogleBusinessProfile({
      adapters,
      database,
      mode: "stub",
      storeId: "demo-store",
    })

    // Then the retry returns the claim they still have to finish, not a dead end.
    expect(result).toEqual(
      buildClaimRequiredResult({
        googleLocationId: "googleLocations/claimed",
        requestAdminRightsUrl: "https://business.google.com/claim/abc",
      })
    )
    database.close()
  })

  it("holds off provisioning while an operator is ruling on an adoption claim", async () => {
    // Given
    const database = await createDatabase()
    let createCalls = 0
    const adapters = createCapturedLocationAdapters(
      createIntegrationAdapters({ database, env: {} }),
      () => {
        createCalls += 1
      }
    )

    // When the store has an adoption claim awaiting an operator verdict
    const result = await setupGoogleBusinessProfile({
      adapters,
      database,
      gbpAccessStore: {
        async getGbpAccessRequestForStore() {
          return {
            id: "access-request",
            storeId: "demo-store",
            gbpLocationRef: "locations/org-owned",
            state: "adoption_review",
            note: null,
            requestedAt: "2026-08-14T00:00:00.000Z",
            grantedAt: null,
            createdAt: "2026-08-14T00:00:00.000Z",
            updatedAt: "2026-08-14T00:00:00.000Z",
          }
        },
      },
      mode: "stub",
      storeId: "demo-store",
    })

    // Then
    expect(result).toEqual({
      status: "ALREADY_LINKED",
      message:
        "이미 등록된 프로필인지 확인하고 있습니다. 확인이 끝나면 알려드릴게요.",
    })
    expect(createCalls).toBe(0)
    database.close()
  })

  it("creates demo OAuth, GBP location, follow-up job, and audit log records", async () => {
    // Given
    const database = await createDatabase()
    // Pin time: the follow-up job's run_after is asserted as a literal one week out.
    const adapters = createIntegrationAdapters({
      database,
      env: {},
      now: new Date("2026-06-04T00:00:00.000Z"),
    })

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

    // Stub setup seeds a deterministic verification row so the owner card and the
    // admin concierge surface have something to render in demos/e2e.
    const verification = database
      .prepare(
        "SELECT state, google_location_id AS googleLocationId FROM gbp_verification_state WHERE store_id = 'demo-store'"
      )
      .get()
    expect(verification).toEqual({
      state: "NEEDS_CONCIERGE",
      googleLocationId: "locations/stub-created",
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

    // Re-running setup now stops at the duplicate guard instead of provisioning
    // again. The row counts below still prove no second location was written —
    // the difference is that the block happens before Google, not after a
    // dedup-by-requestId that only holds for calls this app made itself.
    const secondResult = await setupGoogleBusinessProfile({
      adapters,
      database,
      mode: "stub",
      storeId: "demo-store",
    })
    expect(secondResult.status).toBe("ALREADY_LINKED")

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
