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
        now,
        status: "VERIFICATION_PENDING",
        storeId: demoStoreId,
        subjectId: "repository-google-subject",
      })
      const secondSetup = await gbpStore.persistSetupRecords({
        now,
        status: "VERIFIED",
        storeId: demoStoreId,
        subjectId: "repository-google-subject",
      })
      const updatedJob = await jobStore.updateJobRunStatus({
        attempts: 1,
        id: "setup-gbp-follow-up",
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
        followUpJobId: "setup-gbp-follow-up",
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
            ["setup-gbp-location"]
          )
        )
      ).toEqual({
        googleLocationId: "locations/stub-created",
        status: "VERIFIED",
      })
      await expect(
        gbpStore.readPerformanceLocation(demoStoreId)
      ).resolves.toMatchObject({ kind: "ambiguous_gbp_location" })
      expect(updatedJob).toMatchObject({
        attempts: 1,
        id: "setup-gbp-follow-up",
        status: "RUNNING",
      })
      expect(
        await jobStore.readJobRunByIdempotencyKey("setup-gbp-follow-up-key")
      ).toMatchObject({
        id: "setup-gbp-follow-up",
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
        const firstSetup = await setupGoogleBusinessProfile({
          adapters,
          database,
          mode: "stub",
          storeId: demoStoreId,
        })
        const secondSetup = await setupGoogleBusinessProfile({
          adapters,
          database,
          mode: "stub",
          storeId: demoStoreId,
        })
        const setupRows = setupRowsSchema.parse(
          database
            .prepare(
              "SELECT (SELECT COUNT(*) FROM oauth_connections WHERE id = 'setup-oauth-google') AS oauthConnections, (SELECT COUNT(*) FROM gbp_locations WHERE id = 'setup-gbp-location') AS gbpLocations, (SELECT COUNT(*) FROM job_runs WHERE id = 'setup-gbp-follow-up') AS followUpJobs, (SELECT COUNT(*) FROM audit_logs WHERE id = 'setup-gbp-audit') AS auditLogs"
            )
            .get()
        )

        expect(firstSetup).toMatchObject({
          auditLogId: "setup-gbp-audit",
          followUpJobId: "setup-gbp-follow-up",
          gbpLocationId: "setup-gbp-location",
          oauthConnectionId: "setup-oauth-google",
          status: "VERIFICATION_PENDING",
        })
        expect(secondSetup).toEqual(firstSetup)
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
        await expect(
          gbpStore.readPerformanceLocation(demoStoreId)
        ).resolves.toMatchObject({ kind: "ambiguous_gbp_location" })

        database
          .prepare(
            "UPDATE job_runs SET status = ?, attempts = ?, updated_at = ? WHERE id = ?"
          )
          .run("RUNNING", 1, "2026-06-04T00:05:00.000Z", "setup-gbp-follow-up")
        const jobRow = jobRunRowSchema.parse(
          database
            .prepare(
              "SELECT status, attempts, run_after AS runAfter FROM job_runs WHERE id = ?"
            )
            .get("setup-gbp-follow-up")
        )
        const auditRow = auditLogRowSchema.parse(
          database
            .prepare(
              "SELECT action, redacted_payload_json AS redactedPayloadJson FROM audit_logs WHERE id = ?"
            )
            .get("setup-gbp-audit")
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
