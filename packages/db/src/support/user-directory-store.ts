import { z } from "zod"

import type { Queryable } from "@glocalx/db"

// Admin-facing read/soft-delete over `users`. A dumb guarded-write primitive,
// mirroring gbp-access-store — no domain logic here, just the query shape the
// admin Users console needs.

export type UserDirectoryEntry = {
  readonly id: string
  readonly email: string
  readonly displayName: string
  readonly role: string
  readonly createdAt: string
  readonly deactivatedAt: string | null
  // Usually one store per OWNER, but the demo cohort seed deliberately reuses
  // a single demo user across several stores — a naive JOIN fans that out
  // into duplicate rows, so this is a representative name plus a count
  // instead of a 1:1 store column.
  readonly storeName: string | null
  readonly storeCount: number
}

export interface UserDirectoryStore {
  listUsers(): Promise<readonly UserDirectoryEntry[]>
  // Soft delete: marks the row deactivated and invalidates every session it
  // holds. The row itself, and everything it owns via FK (stores, audit
  // trail), is left in place — deactivation is a login gate, not an erasure.
  // Returns false when the user was already deactivated or does not exist, so
  // the caller can tell "nothing to do" from "it worked".
  deactivateUser(
    userId: string,
    now: Date
  ): Promise<UserDirectoryEntry | undefined>
}

const userDirectoryRowSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: z.string(),
  createdAt: z
    .union([z.string(), z.date()])
    .transform((value) =>
      value instanceof Date ? value.toISOString() : value
    ),
  deactivatedAt: z
    .union([z.string(), z.date()])
    .transform((value) => (value instanceof Date ? value.toISOString() : value))
    .nullable(),
  storeName: z.string().nullable(),
  storeCount: z.coerce.number(),
})

const userDirectoryProjection = `
  users.id,
  users.email,
  users.display_name AS "displayName",
  users.role,
  users.created_at AS "createdAt",
  users.deactivated_at AS "deactivatedAt",
  (SELECT stores.name FROM stores
    WHERE stores.owner_user_id = users.id
    ORDER BY stores.created_at ASC LIMIT 1) AS "storeName",
  (SELECT COUNT(*) FROM stores WHERE stores.owner_user_id = users.id) AS "storeCount"
`

function toUserDirectoryEntry(row: unknown): UserDirectoryEntry {
  return userDirectoryRowSchema.parse(row)
}

export function createDatabaseUserDirectoryStore(
  queryable: Queryable
): UserDirectoryStore {
  return {
    async listUsers() {
      const rows = await queryable.query(
        `SELECT ${userDirectoryProjection}
           FROM users
          ORDER BY users.created_at DESC`
      )
      return rows.map(toUserDirectoryEntry)
    },

    async deactivateUser(userId, now) {
      const nowIso = now.toISOString()
      const result = await queryable.execute(
        `UPDATE users SET deactivated_at = ?
          WHERE id = ? AND deactivated_at IS NULL`,
        [nowIso, userId]
      )
      if (result.changes === 0) {
        return undefined
      }
      // Every existing session for this user stops working immediately, not
      // just future logins — the login path's own deactivated_at check would
      // otherwise leave an already-issued session cookie valid.
      await queryable.execute("DELETE FROM user_sessions WHERE user_id = ?", [
        userId,
      ])

      const row = await queryable.queryOne(
        `SELECT ${userDirectoryProjection}
           FROM users
          WHERE users.id = ?`,
        [userId]
      )
      return row === undefined ? undefined : toUserDirectoryEntry(row)
    },
  }
}
