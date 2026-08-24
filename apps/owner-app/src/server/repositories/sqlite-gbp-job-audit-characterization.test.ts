import { describe, expect, it } from "vitest"
import { z } from "zod"

import { demoStoreId } from "@/auth/session"
import { setupGoogleBusinessProfile } from "@/gbp/setup"

import { createDatabaseAuditLogStore } from "./audit-log-store"
import { createDatabaseGbpStore } from "./gbp-store"
import { createDatabaseJobStore } from "./job-store"
import { withRepositoryTestContext } from "./sqlite-characterization-support"

const setupRowsSchema = z.object({
  auditLogs: z.number(),
  followUpJobs: z.number(),
  gbpLocations: z.number(),
  oauthConnections: z.number(),
})

const jobRunRowSchema = z.object({
  attempts: z.number(),
  runAfter: z.string(),
  status: z.string(),
})

const setupLocationRowSchema = z.object({
  googleLocationId: z.string(),
  status: z.string(),
})

const auditLogRowSchema = z.object({
  action: z.string(),
  redactedPayloadJson: z.string(),
})

const auditPayloadSchema = z.object({
  accessToken: z.literal("[REDACTED]"),
  status: z.string(),
})

describe("SQLite GBP, job, and audit characterization", () => {
  it("persists GBP setup, jobs, and audit rows through queryable repositories", async () => {
    await withRepositoryTestContext(async ({ queryable }) => {
      // Given
      const gbpStore = createDatabaseGbpStore(queryable)
      const jobStore = createDatabaseJobStore(queryable)
      const auditLogStore = createDatabaseAuditLogStore(queryable)
      const now = new Date("2026-06-04T00:00:00.000Z")

      // When
      const firstSetup = await gbpStore.persistSetupRecords({
        actorUserId: "demo-owner",
        now,
        status: "VERIFICATION_PENDING",
        storeId: demoStoreId,
        subjectId: "repository-google-subject",
      })
      const secondSetup = await gbpStore.persistSetupRecords({
        actorUserId: "demo-owner",
        now,
        status: "VERIFIED",
        storeId: demoStoreId,
        subjectId: "repository-google-subject",
      })
      const updatedJob = await jobStore.updateJobRunStatus({
        attempts: 1,
        id: "setup-gbp-follow-up-demo-store",
        status: "RUNNING",
        updatedAt: "2026-06-04T00:05:00.000Z",
      })
      await auditLogStore.appendAuditLog({
        action: "gbp.setup.repository",
        actorUserId: "demo-owner",
        createdAt: "2026-06-04T00:06:00.000Z",
        id: "repository-gbp-audit",
        idempotencyKey: "repository-gbp-audit-key",
        redactedPayload: { accessToken: "[REDACTED]", status: "VERIFIED" },
        storeId: demoStoreId,
      })

      // Then
      expect(firstSetup).toMatchObject({
        followUpJobId: "setup-gbp-follow-up-demo-store",
        status: "VERIFICATION_PENDING",
      })
      expect(secondSetup).toMatchObject({
        status: "VERIFIED",
      })
      await expect(
        gbpStore.readPerformanceConnection(demoStoreId)
      ).resolves.toMatchObject({ kind: "ready" })
      expect(
        setupLocationRowSchema.parse(
          await queryable.queryOne(
            `SELECT google_location_id AS "googleLocationId", status
              FROM gbp_locations
              WHERE id = ?`,
            ["setup-gbp-location-demo-store"]
          )
        )
      ).toEqual({
        googleLocationId: "locations/stub-created-demo-store",
        status: "VERIFIED",
      })
      await expect(
        gbpStore.readPerformanceLocation(demoStoreId)
      ).resolves.toMatchObject({ kind: "ambiguous_gbp_location" })
      expect(updatedJob).toMatchObject({
        attempts: 1,
        id: "setup-gbp-follow-up-demo-store",
        status: "RUNNING",
      })
      expect(
        await jobStore.readJobRunByIdempotencyKey(
          "setup-gbp-follow-up-key-demo-store"
        )
      ).toMatchObject({
        id: "setup-gbp-follow-up-demo-store",
        status: "RUNNING",
      })
      expect(await auditLogStore.readAuditLog("repository-gbp-audit")).toEqual({
        action: "gbp.setup.repository",
        actorUserId: "demo-owner",
        createdAt: "2026-06-04T00:06:00.000Z",
        id: "repository-gbp-audit",
        idempotencyKey: "repository-gbp-audit-key",
        redactedPayload: {
          accessToken: "[REDACTED]",
          status: "VERIFIED",
        },
        storeId: demoStoreId,
      })
    })
  })

  it("characterizes setup upserts, job updates, audit logs, and performance reads", async () => {
    await withRepositoryTestContext(
      async ({ adapters, database, queryable }) => {
        const gbpStore = createDatabaseGbpStore(queryable)
        // The demo seed hands the store a VERIFIED listing, which the duplicate
        // guard refuses to provision over. Characterizing first-time setup means
        // starting from a store with no listing yet.
        database.exec(
          `DELETE FROM gbp_locations WHERE store_id = '${demoStoreId}'`
        )
        const firstSetup = await setupGoogleBusinessProfile({
          actorUserId: "demo-owner",
          adapters,
          database,
          mode: "stub",
          storeId: demoStoreId,
        })
        const secondSetup = await setupGoogleBusinessProfile({
          actorUserId: "demo-owner",
          adapters,
          database,
          mode: "stub",
          storeId: demoStoreId,
        })
        const setupRows = setupRowsSchema.parse(
          database
            .prepare(
              "SELECT (SELECT COUNT(*) FROM oauth_connections WHERE id = 'setup-oauth-google-demo-store') AS oauthConnections, (SELECT COUNT(*) FROM gbp_locations WHERE id = 'setup-gbp-location-demo-store') AS gbpLocations, (SELECT COUNT(*) FROM job_runs WHERE id = 'setup-gbp-follow-up-demo-store') AS followUpJobs, (SELECT COUNT(*) FROM audit_logs WHERE id = 'setup-gbp-audit-demo-store') AS auditLogs"
            )
            .get()
        )

        expect(firstSetup).toMatchObject({
          auditLogId: "setup-gbp-audit-demo-store",
          followUpJobId: "setup-gbp-follow-up-demo-store",
          gbpLocationId: "setup-gbp-location-demo-store",
          oauthConnectionId: "setup-oauth-google-demo-store",
          status: "VERIFICATION_PENDING",
        })
        // Re-running now stops at the duplicate guard rather than re-upserting;
        // the row counts below still characterize the no-second-listing outcome.
        expect(secondSetup).toEqual({
          status: "ALREADY_LINKED",
          googleLocationId: "locations/stub-created-demo-store",
          message: "이미 연결된 Google 비즈니스 프로필이 있습니다.",
        })
        expect(setupRows).toEqual({
          auditLogs: 1,
          followUpJobs: 1,
          gbpLocations: 1,
          oauthConnections: 1,
        })
        await expect(
          gbpStore.readPerformanceConnection(demoStoreId)
        ).resolves.toEqual({
          accessToken: "demo-access-token",
          kind: "ready",
        })
        // Ambiguity here means "this store has more than one location row", which
        // is what the seeded demo listing used to supply alongside the one setup
        // creates. The duplicate guard means setup can no longer produce that
        // second row itself, so the condition under test is restored directly.
        database.exec(
          `INSERT INTO gbp_locations (id, store_id, gbp_account_id, google_location_id, status, request_admin_rights_url, created_at, updated_at)
           VALUES ('second-location', '${demoStoreId}', 'demo-gbp-account', 'locations/demo', 'VERIFIED', NULL, '2026-06-04T00:00:00.000Z', '2026-06-04T00:00:00.000Z')`
        )
        await expect(
          gbpStore.readPerformanceLocation(demoStoreId)
        ).resolves.toMatchObject({ kind: "ambiguous_gbp_location" })

        database
          .prepare(
            "UPDATE job_runs SET status = ?, attempts = ?, updated_at = ? WHERE id = ?"
          )
          .run(
            "RUNNING",
            1,
            "2026-06-04T00:05:00.000Z",
            "setup-gbp-follow-up-demo-store"
          )
        const jobRow = jobRunRowSchema.parse(
          database
            .prepare(
              "SELECT status, attempts, run_after AS runAfter FROM job_runs WHERE id = ?"
            )
            .get("setup-gbp-follow-up-demo-store")
        )
        const auditRow = auditLogRowSchema.parse(
          database
            .prepare(
              "SELECT action, redacted_payload_json AS redactedPayloadJson FROM audit_logs WHERE id = ?"
            )
            .get("setup-gbp-audit-demo-store")
        )
        const auditPayload: unknown = JSON.parse(auditRow.redactedPayloadJson)

        expect(jobRow).toEqual({
          attempts: 1,
          runAfter: "2026-06-11T00:00:00.000Z",
          status: "RUNNING",
        })
        expect(auditRow.action).toBe("gbp.setup.stub")
        expect(auditPayloadSchema.parse(auditPayload)).toEqual({
          accessToken: "[REDACTED]",
          status: "VERIFICATION_PENDING",
        })
      }
    )
  })
})
