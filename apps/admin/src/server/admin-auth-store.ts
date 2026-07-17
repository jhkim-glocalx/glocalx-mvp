import { randomBytes } from "node:crypto"

import { z } from "zod"

import { adminSessionMaxAgeSeconds } from "@/auth/session"
import type { AdminSession } from "@/auth/session"
import type { Queryable } from "@glocalx/db"

export type AdminCredentialRecord = {
  readonly adminUserId: string
  readonly passwordHash: string
}

export interface AdminAuthStore {
  readCredentialByEmail(
    email: string
  ): Promise<AdminCredentialRecord | undefined>
  createSession(adminUserId: string): Promise<string>
  readSession(sessionId: string | undefined): Promise<AdminSession | undefined>
  deleteSession(sessionId: string | undefined): Promise<void>
}

const credentialRowSchema = z.object({
  id: z.string(),
  password_hash: z.string(),
})

const sessionRowSchema = z.object({
  display_name: z.string(),
  email: z.string(),
  id: z.string(),
  role: z.enum(["OPERATOR", "OWNER"]),
})

function createSessionId(): string {
  return randomBytes(32).toString("base64url")
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function createAdminAuthStore(queryable: Queryable): AdminAuthStore {
  return {
    async createSession(adminUserId) {
      const now = new Date()
      const sessionId = createSessionId()
      await queryable.execute(
        "DELETE FROM admin_sessions WHERE expires_at <= ?",
        [now.toISOString()]
      )
      const result = await queryable.execute(
        `INSERT INTO admin_sessions (id, admin_user_id, expires_at, created_at)
        SELECT ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM admin_users WHERE id = ? AND status = 'ACTIVE'
        )`,
        [
          sessionId,
          adminUserId,
          new Date(
            now.getTime() + adminSessionMaxAgeSeconds * 1000
          ).toISOString(),
          now.toISOString(),
          adminUserId,
        ]
      )
      if (result.changes === 0) {
        throw new Error("Cannot create a session for an inactive admin.")
      }
      return sessionId
    },

    async deleteSession(sessionId) {
      const trimmed = sessionId?.trim()
      if (!trimmed) {
        return
      }
      await queryable.execute("DELETE FROM admin_sessions WHERE id = ?", [
        trimmed,
      ])
    },

    async readCredentialByEmail(email) {
      const row = credentialRowSchema.safeParse(
        await queryable.queryOne(
          "SELECT id, password_hash FROM admin_users WHERE email = ? AND status = 'ACTIVE'",
          [normalizeEmail(email)]
        )
      )
      if (!row.success) {
        return undefined
      }
      return {
        adminUserId: row.data.id,
        passwordHash: row.data.password_hash,
      }
    },

    async readSession(sessionId) {
      const trimmed = sessionId?.trim()
      if (!trimmed) {
        return undefined
      }
      const row = sessionRowSchema.safeParse(
        await queryable.queryOne(
          `SELECT
            admin_users.id,
            admin_users.email,
            admin_users.display_name,
            admin_users.role
          FROM admin_sessions
          JOIN admin_users ON admin_users.id = admin_sessions.admin_user_id
          WHERE admin_sessions.id = ?
            AND admin_sessions.expires_at > ?
            AND admin_users.status = 'ACTIVE'`,
          [trimmed, new Date().toISOString()]
        )
      )
      if (!row.success) {
        return undefined
      }
      return {
        adminUserId: row.data.id,
        displayName: row.data.display_name,
        email: row.data.email,
        role: row.data.role,
      }
    },
  }
}
