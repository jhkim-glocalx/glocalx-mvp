import { z } from "zod"

import { locationStatusSchema } from "@/domain/location-status"
import { googleBusinessManageScope } from "@/integrations/credentials"
import type { Queryable } from "@/server/db"
import { decryptToken } from "@/auth/token-encryption"

export type GbpPerformanceConnection =
  | {
      readonly accessToken: string
      readonly kind: "ready"
    }
  | {
      readonly kind:
        | "missing_google_connection"
        | "missing_business_manage_scope"
        | "token_unavailable"
    }

export type GbpPerformanceLocation =
  | {
      readonly googleLocationId: string
      readonly kind: "ready"
      readonly locationName: string
    }
  | {
      readonly kind:
        | "ambiguous_gbp_location"
        | "location_not_verified"
        | "missing_gbp_location"
      readonly locationName: string
    }

export type GbpPerformanceSummaryData = {
  readonly category: string | null
  readonly draftCount: number
  readonly googleLocationId: string | null
  readonly lastSyncedAt: string
  readonly locationStatus: string
  readonly phone: string | null
  readonly publishedCount: number
  readonly storeName: string
}

const storeRowSchema = z.object({ name: z.string() }).strict()

const oauthConnectionRowSchema = z
  .object({
    encrypted_access_token: z.string(),
    scopes_json: z.union([z.string(), z.array(z.string())]),
  })
  .strict()

const locationRowSchema = z
  .object({
    google_location_id: z.string().nullable(),
    status: locationStatusSchema,
  })
  .strict()

const timestampSchema = z.union([z.string(), z.date()]).transform((value) => {
  return value instanceof Date ? value.toISOString() : value
})

const storePerformanceRowSchema = z.object({
  category: z.string().nullable(),
  name: z.string(),
  phone: z.string().nullable(),
})

const locationPerformanceRowSchema = z.object({
  google_location_id: z.string().nullable(),
  status: z.string(),
  updated_at: timestampSchema,
})

const countRowSchema = z.object({
  count: z.number(),
})

function parseScopes(
  scopesValue: string | readonly string[]
): readonly string[] {
  if (typeof scopesValue !== "string") {
    return scopesValue
  }

  let payload: unknown
  try {
    payload = JSON.parse(scopesValue)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return []
    }
    throw error
  }
  const parsed = z.array(z.string()).safeParse(payload)
  return parsed.success ? parsed.data : []
}

async function getCount(
  queryable: Queryable,
  query: string,
  storeId: string
): Promise<number> {
  const row = await queryable.queryOne(query, [storeId])
  return countRowSchema.parse(row).count
}

export async function loadGbpPerformanceSummaryData(
  queryable: Queryable,
  storeId: string
): Promise<GbpPerformanceSummaryData> {
  const store = storePerformanceRowSchema.parse(
    await queryable.queryOne(
      "SELECT name, phone, category FROM stores WHERE id = ?",
      [storeId]
    )
  )
  const location = locationPerformanceRowSchema.parse(
    await queryable.queryOne(
      "SELECT status, google_location_id, updated_at FROM gbp_locations WHERE store_id = ? ORDER BY updated_at DESC LIMIT 1",
      [storeId]
    )
  )
  const draftCount = await getCount(
    queryable,
    "SELECT COUNT(*) AS count FROM post_drafts WHERE store_id = ?",
    storeId
  )
  const publishedCount = await getCount(
    queryable,
    "SELECT COUNT(*) AS count FROM post_drafts WHERE store_id = ? AND status = 'PUBLISHED'",
    storeId
  )

  return {
    category: store.category,
    draftCount,
    googleLocationId: location.google_location_id,
    lastSyncedAt: location.updated_at,
    locationStatus: location.status,
    phone: store.phone,
    publishedCount,
    storeName: store.name,
  }
}

export async function loadGbpPerformanceConnection(
  queryable: Queryable,
  storeId: string
): Promise<GbpPerformanceConnection> {
  const row = await queryable.queryOne(
    "SELECT encrypted_access_token, scopes_json FROM oauth_connections WHERE store_id = ? AND provider = 'GOOGLE' ORDER BY created_at DESC LIMIT 1",
    [storeId]
  )
  if (row === undefined) {
    return { kind: "missing_google_connection" }
  }

  const parsed = oauthConnectionRowSchema.parse(row)
  const scopes = parseScopes(parsed.scopes_json)
  if (!scopes.includes(googleBusinessManageScope)) {
    return { kind: "missing_business_manage_scope" }
  }

  const accessToken = decryptToken(parsed.encrypted_access_token)
  if (accessToken === undefined) {
    return { kind: "token_unavailable" }
  }
  return { accessToken, kind: "ready" }
}

export async function loadGbpPerformanceLocation(
  queryable: Queryable,
  storeId: string
): Promise<GbpPerformanceLocation> {
  const store = storeRowSchema.parse(
    await queryable.queryOne("SELECT name FROM stores WHERE id = ?", [storeId])
  )
  const rows = z
    .array(locationRowSchema)
    .parse(
      await queryable.query(
        "SELECT google_location_id, status FROM gbp_locations WHERE store_id = ? AND google_location_id IS NOT NULL ORDER BY updated_at DESC",
        [storeId]
      )
    )
  if (rows.length === 0) {
    return { kind: "missing_gbp_location", locationName: store.name }
  }
  if (rows.length > 1) {
    return { kind: "ambiguous_gbp_location", locationName: store.name }
  }

  const location = rows[0]
  if (location === undefined || location.google_location_id === null) {
    return { kind: "missing_gbp_location", locationName: store.name }
  }
  if (location.status !== "VERIFIED") {
    return { kind: "location_not_verified", locationName: store.name }
  }
  return {
    googleLocationId: location.google_location_id,
    kind: "ready",
    locationName: store.name,
  }
}
