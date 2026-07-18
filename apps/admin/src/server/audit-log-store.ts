import { randomUUID } from "node:crypto"

import type { Queryable } from "@glocalx/db"

// Operator actions on a conversation (reply, resolve) are audited so an
// out-of-band decision is traceable. audit_logs.actor_user_id FKs to users(id)
// — operators live in admin_users, not users — so the operator identity is
// carried in the redacted payload instead, and actor_user_id stays NULL.
export type AdminAuditAction = "cs_reply" | "cs_resolve" | "cs_assign"

export type AdminAuditEntry = {
  readonly action: AdminAuditAction
  readonly adminUserId: string
  readonly storeId: string
  readonly conversationId: string
  // Codes/ids only — never message bodies or other owner content.
  readonly detail?: Readonly<Record<string, string>>
}

export interface AdminAuditLogStore {
  record(entry: AdminAuditEntry): Promise<void>
}

export function createAdminAuditLogStore(
  queryable: Queryable
): AdminAuditLogStore {
  return {
    async record(entry) {
      const payload = {
        adminUserId: entry.adminUserId,
        conversationId: entry.conversationId,
        ...entry.detail,
      }
      await queryable.execute(
        `INSERT INTO audit_logs (
           id, store_id, actor_user_id, action, idempotency_key,
           redacted_payload_json, created_at
         ) VALUES (?, ?, NULL, ?, NULL, ?, ?)`,
        [
          randomUUID(),
          entry.storeId,
          entry.action,
          JSON.stringify(payload),
          new Date().toISOString(),
        ]
      )
    },
  }
}
