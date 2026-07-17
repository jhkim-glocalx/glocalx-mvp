import type { Queryable } from "@glocalx/db"
import { z } from "zod"

export type AuditLogRecord = {
  readonly id: string
  readonly action: string
  readonly actorUserId: string | null
  readonly createdAt: string
  readonly idempotencyKey: string | null
  readonly redactedPayload: Readonly<Record<string, unknown>>
  readonly storeId: string | null
}

export interface AuditLogStore {
  appendAuditLog(record: AuditLogRecord): Promise<void>
  readAuditLog(id: string): Promise<AuditLogRecord | undefined>
  readAuditLogsForStore(storeId: string): Promise<readonly AuditLogRecord[]>
}

const timestampSchema = z.union([z.string(), z.date()]).transform((value) => {
  return value instanceof Date ? value.toISOString() : value
})

const redactedPayloadSchema = z.union([
  z.string().transform((value) => {
    let payload: unknown
    try {
      payload = JSON.parse(value)
    } catch (error) {
      if (error instanceof SyntaxError) {
        return {}
      }
      throw error
    }
    return z.record(z.string(), z.unknown()).parse(payload)
  }),
  z.record(z.string(), z.unknown()),
])

const auditLogRowSchema = z.object({
  action: z.string(),
  actorUserId: z.string().nullable(),
  createdAt: timestampSchema,
  id: z.string(),
  idempotencyKey: z.string().nullable(),
  redactedPayload: redactedPayloadSchema,
  storeId: z.string().nullable(),
})

function toAuditLog(row: unknown): AuditLogRecord {
  return auditLogRowSchema.parse(row)
}

const auditLogProjection = `
  id,
  store_id AS "storeId",
  actor_user_id AS "actorUserId",
  action,
  idempotency_key AS "idempotencyKey",
  redacted_payload_json AS "redactedPayload",
  created_at AS "createdAt"
`

export function createDatabaseAuditLogStore(
  queryable: Queryable
): AuditLogStore {
  return {
    async appendAuditLog(record) {
      await queryable.execute(
        `INSERT INTO audit_logs (
          id,
          store_id,
          actor_user_id,
          action,
          idempotency_key,
          redacted_payload_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          store_id = excluded.store_id,
          actor_user_id = excluded.actor_user_id,
          action = excluded.action,
          idempotency_key = excluded.idempotency_key,
          redacted_payload_json = excluded.redacted_payload_json,
          created_at = excluded.created_at`,
        [
          record.id,
          record.storeId,
          record.actorUserId,
          record.action,
          record.idempotencyKey,
          JSON.stringify(record.redactedPayload),
          record.createdAt,
        ]
      )
    },

    async readAuditLog(id) {
      const row = await queryable.queryOne(
        `SELECT ${auditLogProjection} FROM audit_logs WHERE id = ?`,
        [id]
      )
      return row === undefined ? undefined : toAuditLog(row)
    },

    async readAuditLogsForStore(storeId) {
      const rows = await queryable.query(
        `SELECT ${auditLogProjection}
          FROM audit_logs
          WHERE store_id = ?
          ORDER BY created_at ASC, id ASC`,
        [storeId]
      )
      return rows.map(toAuditLog)
    },
  }
}
