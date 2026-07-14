import { randomUUID } from "node:crypto"

import type { Queryable } from "@/server/db"

export async function createGbpRegistrationIntent(options: {
  readonly googleSubjectId: string
  readonly now: Date
  readonly payloadDigest: string
  readonly queryable: Queryable
  readonly storeId: string
}): Promise<string> {
  const id = randomUUID()
  const expiresAt = new Date(options.now.getTime() + 15 * 60 * 1000)
  await options.queryable.execute(
    `INSERT INTO gbp_registration_intents (
      id, store_id, google_subject_id, payload_digest, expires_at, consumed_at, created_at
    ) VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    [
      id,
      options.storeId,
      options.googleSubjectId,
      options.payloadDigest,
      expiresAt.toISOString(),
      options.now.toISOString(),
    ]
  )
  return id
}

export async function consumeGbpRegistrationIntent(options: {
  readonly googleSubjectId: string
  readonly id: string
  readonly now: Date
  readonly payloadDigest: string
  readonly queryable: Queryable
  readonly storeId: string
}): Promise<boolean> {
  const row = await options.queryable.queryOne(
    `UPDATE gbp_registration_intents
      SET consumed_at = ?
      WHERE id = ?
        AND store_id = ?
        AND google_subject_id = ?
        AND payload_digest = ?
        AND consumed_at IS NULL
        AND expires_at > ?
      RETURNING id`,
    [
      options.now.toISOString(),
      options.id,
      options.storeId,
      options.googleSubjectId,
      options.payloadDigest,
      options.now.toISOString(),
    ]
  )
  return row !== undefined
}
