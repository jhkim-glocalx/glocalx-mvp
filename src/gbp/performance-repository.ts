import { z } from "zod"

import { locationStatusSchema } from "@/domain/location-status"
import { googleBusinessManageScope } from "@/integrations/credentials"
import type { SqliteDatabase } from "@/server/db/sqlite"
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

const storeRowSchema = z.object({ name: z.string() }).strict()

const oauthConnectionRowSchema = z
  .object({
    encrypted_access_token: z.string(),
    scopes_json: z.string(),
  })
  .strict()

const locationRowSchema = z
  .object({
    google_location_id: z.string().nullable(),
    status: locationStatusSchema,
  })
  .strict()

function parseScopes(scopesJson: string): readonly string[] {
  let payload: unknown
  try {
    payload = JSON.parse(scopesJson)
  } catch {
    return []
  }
  const parsed = z.array(z.string()).safeParse(payload)
  return parsed.success ? parsed.data : []
}

export function loadGbpPerformanceConnection(
  database: SqliteDatabase,
  storeId: string
): GbpPerformanceConnection {
  const row = database
    .prepare(
      "SELECT encrypted_access_token, scopes_json FROM oauth_connections WHERE store_id = ? AND provider = 'GOOGLE' ORDER BY created_at DESC LIMIT 1"
    )
    .get(storeId)
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

export function loadGbpPerformanceLocation(
  database: SqliteDatabase,
  storeId: string
): GbpPerformanceLocation {
  const store = storeRowSchema.parse(
    database.prepare("SELECT name FROM stores WHERE id = ?").get(storeId)
  )
  const rows = z
    .array(locationRowSchema)
    .parse(
      database
        .prepare(
          "SELECT google_location_id, status FROM gbp_locations WHERE store_id = ? AND google_location_id IS NOT NULL ORDER BY updated_at DESC"
        )
        .all(storeId)
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
