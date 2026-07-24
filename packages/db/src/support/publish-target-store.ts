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

// Reading a stored channel token has three outcomes, and only the middle one is
// benign: a link with no token yet falls back to the environment credential,
// while a token we cannot decrypt is a real fault that must fail the job.
export type StoreChannelTokenLookup =
  | { readonly kind: "found"; readonly accessToken: string }
  | { readonly kind: "absent" }
  | { readonly kind: "undecryptable" }

export interface PublishTargetStore {
  // Undefined when the store has no GBP location at all — a different operator
  // problem than a location that exists but is not yet verified.
  readGbpLocationStatus(storeId: string): Promise<LocationStatus | undefined>
  readGbpPublishingCredentials(
    storeId: string
  ): Promise<GbpPublishingCredentials | undefined>
  // The v2 campaign path publishes with the *org* token, so it needs the
  // location's `parent` without requiring the owner's Google connection to
  // exist at all. v1's owner-token path keeps using the pair above.
  readGbpPublishParent(storeId: string): Promise<string | undefined>
  readStoreChannelLink(
    storeId: string,
    channel: PublishChannel
  ): Promise<StoreChannelLink | undefined>
  // Deliberately separate from readStoreChannelLink: eligibility and the queue
  // view render that link, and token material must never reach a view model.
  readStoreChannelToken(
    storeId: string,
    channel: PublishChannel
  ): Promise<StoreChannelTokenLookup>
}

const publishingCredentialsRowSchema = z.object({
  accountName: z.string(),
  encryptedAccessToken: z.string(),
  googleLocationId: z.string(),
})

// encrypted_token is deliberately not projected here — readStoreChannelToken is
// the only path that reads it, so a link can be rendered without ever loading
// token material into a view model.
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

const publishParentRowSchema = z.object({
  accountName: z.string(),
  googleLocationId: z.string(),
})

export async function readGbpPublishParent(
  queryable: Queryable,
  storeId: string
): Promise<string | undefined> {
  // Same VERIFIED-only target as readGbpPublishingCredentials, minus the join to
  // the owner's oauth_connections row — the org account supplies the token, so a
  // store whose owner never connected Google is still publishable.
  const row = await queryable.queryOne(
    `SELECT account.account_name AS "accountName",
      location.google_location_id AS "googleLocationId"
    FROM gbp_locations AS location
    JOIN gbp_accounts AS account
      ON account.id = location.gbp_account_id AND account.store_id = location.store_id
    WHERE location.store_id = ? AND location.status = 'VERIFIED'
      AND location.google_location_id IS NOT NULL
    ORDER BY location.updated_at DESC
    LIMIT 1`,
    [storeId]
  )
  if (row === undefined) {
    return undefined
  }
  const parsed = publishParentRowSchema.parse(row)
  return parsed.googleLocationId.startsWith("accounts/")
    ? parsed.googleLocationId
    : `${parsed.accountName}/${parsed.googleLocationId}`
}

const storeChannelTokenRowSchema = z.object({
  encryptedToken: z.string().nullable(),
})

export async function readStoreChannelToken(
  queryable: Queryable,
  storeId: string,
  channel: PublishChannel
): Promise<StoreChannelTokenLookup> {
  const row = await queryable.queryOne(
    `SELECT encrypted_token AS "encryptedToken"
       FROM store_channel_links
      WHERE store_id = ? AND channel = ?`,
    [storeId, channel]
  )
  if (row === undefined) {
    return { kind: "absent" }
  }

  const parsed = storeChannelTokenRowSchema.parse(row)
  if (parsed.encryptedToken === null) {
    return { kind: "absent" }
  }

  const accessToken = decryptToken(parsed.encryptedToken)
  return accessToken === undefined
    ? { kind: "undecryptable" }
    : { kind: "found", accessToken }
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
    readGbpPublishParent(storeId) {
      return readGbpPublishParent(queryable, storeId)
    },
    readStoreChannelLink(storeId, channel) {
      return readStoreChannelLink(queryable, storeId, channel)
    },
    readStoreChannelToken(storeId, channel) {
      return readStoreChannelToken(queryable, storeId, channel)
    },
  }
}
