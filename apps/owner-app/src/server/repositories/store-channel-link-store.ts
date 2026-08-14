import type { Queryable } from "@glocalx/db"
import type {
  PublishChannel,
  StoreChannelLinkStatus,
} from "@glocalx/domain/campaign-state-machine"
import { z } from "zod"

export type UpsertStoreChannelLinkInput = {
  readonly storeId: string
  readonly channel: PublishChannel
  readonly externalAccountRef: string
  // Encrypted before it reaches the store — the writer never sees a raw token.
  readonly encryptedToken: string | null
  readonly status: StoreChannelLinkStatus
  // The account the owner named during onboarding, and the one the
  // authorization actually returned. Both are human-readable handles kept for
  // review; externalAccountRef stays the id the publish path posts through.
  readonly requestedAccountHandle?: string | null
  readonly linkedAccountUsername?: string | null
  readonly now: Date
}

// The two human-readable names on a link. Deliberately excludes the token and
// the external reference: this is what owner-facing screens are allowed to show.
export type StoreChannelLinkAccountNames = {
  readonly requestedAccountHandle: string | undefined
  readonly linkedAccountUsername: string | undefined
}

export interface StoreChannelLinkStore {
  upsertLink(input: UpsertStoreChannelLinkInput): Promise<void>
  readAccountNames(input: {
    readonly storeId: string
    readonly channel: PublishChannel
  }): Promise<StoreChannelLinkAccountNames | undefined>
}

const accountNamesRowSchema = z.object({
  requestedAccountHandle: z.string().nullable(),
  linkedAccountUsername: z.string().nullable(),
})

export function createDatabaseStoreChannelLinkStore(
  queryable: Queryable
): StoreChannelLinkStore {
  return {
    async readAccountNames({ channel, storeId }) {
      const row = await queryable.queryOne(
        `SELECT requested_account_handle AS "requestedAccountHandle",
                linked_account_username AS "linkedAccountUsername"
           FROM store_channel_links
          WHERE store_id = ? AND channel = ?`,
        [storeId, channel]
      )
      if (row === undefined) {
        return undefined
      }
      const parsed = accountNamesRowSchema.parse(row)
      return {
        requestedAccountHandle: parsed.requestedAccountHandle ?? undefined,
        linkedAccountUsername: parsed.linkedAccountUsername ?? undefined,
      }
    },

    async upsertLink(input) {
      const timestamp = input.now.toISOString()
      // Reconnecting a channel replaces its link cleanly: the unique
      // (store_id, channel) index drives ON CONFLICT DO UPDATE, so a fresh
      // token/account overwrites in place instead of accumulating rows. The
      // generated id and created_at only take effect on first insert;
      // updated_at always advances. `excluded` is portable across SQLite and
      // Postgres.
      await queryable.execute(
        `INSERT INTO store_channel_links
           (id, store_id, channel, external_account_ref, encrypted_token, status,
            requested_account_handle, linked_account_username, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (store_id, channel) DO UPDATE SET
           external_account_ref = excluded.external_account_ref,
           encrypted_token = excluded.encrypted_token,
           status = excluded.status,
           requested_account_handle = excluded.requested_account_handle,
           linked_account_username = excluded.linked_account_username,
           updated_at = excluded.updated_at`,
        [
          crypto.randomUUID(),
          input.storeId,
          input.channel,
          input.externalAccountRef,
          input.encryptedToken,
          input.status,
          input.requestedAccountHandle ?? null,
          input.linkedAccountUsername ?? null,
          timestamp,
          timestamp,
        ]
      )
    },
  }
}
