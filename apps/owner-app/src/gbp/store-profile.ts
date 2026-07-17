import { Buffer } from "node:buffer"

import { z } from "zod"

import type { SqliteDatabase } from "@/server/db/sqlite"

const confirmedStoreRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  phone: z.string(),
  category: z.string(),
  hours: z.string().nullable(),
})

export type ConfirmedGbpStoreProfile = {
  readonly storeId: string
  readonly name: string
  readonly address: string
  readonly phone: string
  readonly category: string
  readonly hours?: string
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
      "SELECT id, name, address, phone, category, hours FROM stores WHERE id = ? AND phone IS NOT NULL AND EXISTS (SELECT 1 FROM business_profile_extractions WHERE store_id = stores.id AND status = 'CONFIRMED')"
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
    },
  }
}

export function buildGoogleLocationBody(
  profile: ConfirmedGbpStoreProfile
): Readonly<Record<string, unknown>> {
  // Google receives the confirmed store fields verbatim; storeCode ties retries back to this local store.
  return {
    title: profile.name,
    storeCode: profile.storeId,
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
  // Identical confirmed profile data gets the same request id so Google validate/create retries stay idempotent.
  const encoded = Buffer.from(
    `${profile.storeId}:${profile.name}:${profile.address}:${profile.phone}`
  )
    .toString("base64url")
    .slice(0, 24)
  return `gbp-setup-${encoded}`
}
