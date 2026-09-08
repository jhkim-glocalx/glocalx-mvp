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
  // Hard delete: erases the account and everything it owns, freeing the email
  // for a fresh sign-up. Deactivation leaves the `users` row in place, and its
  // UNIQUE(email) then rejects re-registration forever — an account stuck in
  // that state can neither log in nor be re-created, so an operator needs a way
  // to erase it outright. Returns the row as it looked before deletion, or
  // undefined when no such user exists.
  deleteUser(userId: string): Promise<UserDirectoryEntry | undefined>
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

// Store-scoped rows whose FK to `stores` has no ON DELETE CASCADE, in the order
// that satisfies their own inter-table FKs (attempts before drafts, replies
// before reviews, locations before accounts). Everything omitted here — the
// conversation, CS, campaign, channel-link, GBP-access and verification tables,
// plus user_sessions — already cascades from stores or users.
const storeScopedDeletes = [
  `DELETE FROM post_publish_attempts
    WHERE draft_id IN (
      SELECT id FROM post_drafts WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)
    )`,
  "DELETE FROM post_drafts WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)",
  `DELETE FROM review_replies
    WHERE review_id IN (
      SELECT id FROM reviews WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)
    )`,
  "DELETE FROM reviews WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)",
  "DELETE FROM job_runs WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)",
  "DELETE FROM gbp_locations WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)",
  "DELETE FROM gbp_accounts WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)",
  "DELETE FROM oauth_connections WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)",
  "DELETE FROM business_profile_extractions WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)",
]

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

    async deleteUser(userId) {
      const existing = await queryable.queryOne(
        `SELECT ${userDirectoryProjection}
           FROM users
          WHERE users.id = ?`,
        [userId]
      )
      if (existing === undefined) {
        return undefined
      }

      await queryable.transaction(async (transaction) => {
        // post_drafts.revision_of_draft_id points at another draft of the same
        // store. SQLite checks FKs row-by-row inside a statement, so a revision
        // still pointing at an already-deleted original would abort the drafts
        // delete below; cut the link before anything is removed.
        await transaction.execute(
          `UPDATE post_drafts SET revision_of_draft_id = NULL
            WHERE store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)`,
          [userId]
        )
        for (const statement of storeScopedDeletes) {
          await transaction.execute(statement, [userId])
        }
        // Audit rows are detached, not deleted: for the gbp_access_* actions
        // the entry is the only record of who authorized attaching an
        // org-owned listing, so it has to outlive the account it was about.
        // Nulling both FK columns is what lets the stores and the user row go.
        await transaction.execute(
          `UPDATE audit_logs SET actor_user_id = NULL, store_id = NULL
            WHERE actor_user_id = ?
               OR store_id IN (SELECT id FROM stores WHERE owner_user_id = ?)`,
          [userId, userId]
        )
        await transaction.execute(
          "DELETE FROM stores WHERE owner_user_id = ?",
          [userId]
        )
        await transaction.execute(
          "DELETE FROM auth_identities WHERE user_id = ?",
          [userId]
        )
        await transaction.execute("DELETE FROM users WHERE id = ?", [userId])
      })

      return toUserDirectoryEntry(existing)
    },
  }
}
