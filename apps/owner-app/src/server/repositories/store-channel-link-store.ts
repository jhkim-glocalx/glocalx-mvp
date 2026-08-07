import type { Queryable } from "@glocalx/db"
import type {
  PublishChannel,
  StoreChannelLinkStatus,
} from "@glocalx/domain/campaign-state-machine"

export type UpsertStoreChannelLinkInput = {
  readonly storeId: string
  readonly channel: PublishChannel
  readonly externalAccountRef: string
  // Encrypted before it reaches the store — the writer never sees a raw token.
  readonly encryptedToken: string | null
  readonly status: StoreChannelLinkStatus
  readonly now: Date
}

export interface StoreChannelLinkStore {
  upsertLink(input: UpsertStoreChannelLinkInput): Promise<void>
}

export function createDatabaseStoreChannelLinkStore(
  queryable: Queryable
): StoreChannelLinkStore {
  return {
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
           (id, store_id, channel, external_account_ref, encrypted_token, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (store_id, channel) DO UPDATE SET
           external_account_ref = excluded.external_account_ref,
           encrypted_token = excluded.encrypted_token,
           status = excluded.status,
           updated_at = excluded.updated_at`,
        [
          crypto.randomUUID(),
          input.storeId,
          input.channel,
          input.externalAccountRef,
          input.encryptedToken,
          input.status,
          timestamp,
          timestamp,
        ]
      )
    },
  }
}
