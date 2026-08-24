import { createHash } from "node:crypto"

import { z } from "zod"

import type { SqliteDatabase } from "@glocalx/db/sqlite"

const confirmedStoreRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  phone: z.string(),
  category: z.string(),
  hours: z.string().nullable(),
  gbp_primary_category_id: z.string().nullable(),
})

export type ConfirmedGbpStoreProfile = {
  readonly storeId: string
  readonly name: string
  readonly address: string
  readonly phone: string
  readonly category: string
  readonly hours?: string
  // The owner-selected `categories/gcid:*` resource name persisted during GBP
  // setup. Absent on stub-mode setups and until the owner picks a category; the
  // live locations.create path blocks without it.
  readonly primaryCategoryId?: string
}

export type ConfirmedGbpStoreProfileResult =
  | {
      readonly kind: "found"
      readonly profile: ConfirmedGbpStoreProfile
    }
  | {
      readonly kind: "missing"
    }

export function getConfirmedGbpStoreProfile(
  database: SqliteDatabase,
  storeId: string
): ConfirmedGbpStoreProfileResult {
  // GBP setup only trusts owner-confirmed profiles with a phone number, not raw extraction guesses.
  const row = database
    .prepare(
      "SELECT id, name, address, phone, category, hours, gbp_primary_category_id FROM stores WHERE id = ? AND phone IS NOT NULL AND EXISTS (SELECT 1 FROM business_profile_extractions WHERE store_id = stores.id AND status = 'CONFIRMED')"
    )
    .get(storeId)

  const parsed = confirmedStoreRowSchema.safeParse(row)
  if (!parsed.success) {
    return { kind: "missing" }
  }

  return {
    kind: "found",
    profile: {
      storeId: parsed.data.id,
      name: parsed.data.name,
      address: parsed.data.address,
      phone: parsed.data.phone,
      category: parsed.data.category,
      ...(parsed.data.hours === null ? {} : { hours: parsed.data.hours }),
      ...(parsed.data.gbp_primary_category_id === null
        ? {}
        : { primaryCategoryId: parsed.data.gbp_primary_category_id }),
    },
  }
}

export function buildGoogleLocationBody(
  profile: ConfirmedGbpStoreProfile
): Readonly<Record<string, unknown>> {
  // Google receives the confirmed store fields verbatim, minus storeCode — it
  // renders as the first column of the owner's dashboard, so neither this body
  // nor the live one leaks our internal store id there; retries key off requestId.
  //
  // Unlike the live body in setup-live.ts, this stub body sends no
  // administrativeArea/locality, so the address must keep its 시/구 prefix here —
  // there is nothing else carrying it, and nothing to duplicate against.
  return {
    title: profile.name,
    storefrontAddress: {
      regionCode: "KR",
      addressLines: [profile.address],
    },
    phoneNumbers: {
      primaryPhone: profile.phone,
    },
    categories: {
      primaryCategory: {
        displayName: profile.category,
      },
    },
  }
}

export function stableGbpSetupRequestId(
  profile: ConfirmedGbpStoreProfile
): string {
  // Identical confirmed profile data gets the same request id so Google validate/create
  // retries stay idempotent. Hashed rather than truncated-encoded: slicing raw base64url
  // bytes drops everything past the first ~18 bytes (usually little more than storeId),
  // so two different profiles sharing that prefix collided into the same requestId.
  const digest = createHash("sha256")
    .update(
      `${profile.storeId}:${profile.name}:${profile.address}:${profile.phone}`
    )
    .digest("base64url")
  return `gbp-setup-${digest}`
}
