import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { createIntegrationAdapters } from "@/integrations"
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

  it("creates demo OAuth, GBP location, follow-up job, and audit log records", async () => {
    // Given
    const database = await createDatabase()
    const adapters = createIntegrationAdapters({ database, env: {} })

    // When
    const result = setupGoogleBusinessProfile({
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
    expect(oauthRow).toEqual({
      encrypted_access_token: "encrypted:valid-code",
      subject_id: "production-google-oauth-placeholder",
    })
    database.close()
  })
})
