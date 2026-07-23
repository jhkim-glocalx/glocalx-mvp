import type {
  PublishChannel,
  StoreChannelLinkStatus,
} from "@glocalx/domain/campaign-state-machine"
import { locationStatusSchema } from "@glocalx/domain/location-status"
import type { LocationStatus } from "@glocalx/domain/location-status"
import { decryptToken } from "@glocalx/domain/token-encryption"
import { z } from "zod"

import type { Queryable } from "../types.ts"
import { timestampSchema } from "./row-codecs.ts"

// Everything the publish path needs to answer "can this store publish to this
// channel, and with what credentials". Lives in packages/db because both apps
// read it: the owner app to decide whether a v1 draft may go live, the admin
// app to gate and run the campaign publish panel.

export type GbpPublishingCredentials = {
  readonly accessToken: string
  readonly parent: string
}

export type StoreChannelLink = {
  readonly id: string
  readonly storeId: string
  readonly channel: PublishChannel
  readonly externalAccountRef: string
  readonly status: StoreChannelLinkStatus
  readonly createdAt: string
  readonly updatedAt: string
}

export interface PublishTargetStore {
  // Undefined when the store has no GBP location at all — a different operator
  // problem than a location that exists but is not yet verified.
  readGbpLocationStatus(storeId: string): Promise<LocationStatus | undefined>
  readGbpPublishingCredentials(
    storeId: string
  ): Promise<GbpPublishingCredentials | undefined>
  readStoreChannelLink(
    storeId: string,
    channel: PublishChannel
  ): Promise<StoreChannelLink | undefined>
}

const publishingCredentialsRowSchema = z.object({
  accountName: z.string(),
  encryptedAccessToken: z.string(),
  googleLocationId: z.string(),
})

// encrypted_token is deliberately not projected: nothing in Phase 3 task 6
// reads it, and the token stays unread until task 7's admin-only credential
// path exists.
const storeChannelLinkRowSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  channel: z.string(),
  externalAccountRef: z.string(),
  status: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export async function readGbpLocationStatus(
  queryable: Queryable,
  storeId: string
): Promise<LocationStatus | undefined> {
  const row = await queryable.queryOne(
    `SELECT status
       FROM gbp_locations
      WHERE store_id = ?
      ORDER BY updated_at DESC
      LIMIT 1`,
    [storeId]
  )
  if (row === undefined) {
    return undefined
  }
  return locationStatusSchema.parse(row["status"])
}

export async function readGbpPublishingCredentials(
  queryable: Queryable,
  storeId: string
): Promise<GbpPublishingCredentials | undefined> {
  const row = await queryable.queryOne(
    `SELECT account.account_name AS "accountName",
      connection.encrypted_access_token AS "encryptedAccessToken",
      location.google_location_id AS "googleLocationId"
    FROM gbp_locations AS location
    JOIN gbp_accounts AS account
      ON account.id = location.gbp_account_id AND account.store_id = location.store_id
    JOIN oauth_connections AS connection
      ON connection.store_id = location.store_id AND connection.provider = 'GOOGLE'
    WHERE location.store_id = ? AND location.status = 'VERIFIED'
      AND location.google_location_id IS NOT NULL
    ORDER BY connection.created_at DESC, location.updated_at DESC
    LIMIT 1`,
    [storeId]
  )
  if (row === undefined) {
    return undefined
  }
  const parsed = publishingCredentialsRowSchema.parse(row)
  const accessToken = decryptToken(parsed.encryptedAccessToken)
  if (accessToken === undefined) {
    return undefined
  }
  return {
    accessToken,
    parent: parsed.googleLocationId.startsWith("accounts/")
      ? parsed.googleLocationId
      : `${parsed.accountName}/${parsed.googleLocationId}`,
  }
}

export async function readStoreChannelLink(
  queryable: Queryable,
  storeId: string,
  channel: PublishChannel
): Promise<StoreChannelLink | undefined> {
  const row = await queryable.queryOne(
    `SELECT id,
            store_id AS "storeId",
            channel,
            external_account_ref AS "externalAccountRef",
            status,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
       FROM store_channel_links
      WHERE store_id = ? AND channel = ?`,
    [storeId, channel]
  )
  if (row === undefined) {
    return undefined
  }
  const parsed = storeChannelLinkRowSchema.parse(row)
  return {
    ...parsed,
    channel: parsed.channel as PublishChannel,
    status: parsed.status as StoreChannelLinkStatus,
  }
}

export function createDatabasePublishTargetStore(
  queryable: Queryable
): PublishTargetStore {
  return {
    readGbpLocationStatus(storeId) {
      return readGbpLocationStatus(queryable, storeId)
    },
    readGbpPublishingCredentials(storeId) {
      return readGbpPublishingCredentials(queryable, storeId)
    },
    readStoreChannelLink(storeId, channel) {
      return readStoreChannelLink(queryable, storeId, channel)
    },
  }
}
