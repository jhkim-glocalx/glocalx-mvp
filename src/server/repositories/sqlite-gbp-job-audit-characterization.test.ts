import { describe, expect, it } from "vitest"
import { z } from "zod"

import { demoStoreId } from "@/auth/session"
import {
  loadGbpPerformanceConnection,
  loadGbpPerformanceLocation,
} from "@/gbp/performance-repository"
import { setupGoogleBusinessProfile } from "@/gbp/setup"

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

const auditLogRowSchema = z.object({
  action: z.string(),
  redactedPayloadJson: z.string(),
})

const auditPayloadSchema = z.object({
  accessToken: z.literal("[REDACTED]"),
  status: z.string(),
})

describe("SQLite GBP, job, and audit characterization", () => {
  it("characterizes setup upserts, job updates, audit logs, and performance reads", async () => {
    await withRepositoryTestContext(async ({ adapters, database }) => {
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
      expect(loadGbpPerformanceConnection(database, demoStoreId)).toEqual({
        accessToken: "demo-access-token",
        kind: "ready",
      })
      expect(loadGbpPerformanceLocation(database, demoStoreId)).toMatchObject({
        kind: "ambiguous_gbp_location",
      })

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
    })
  })
})
