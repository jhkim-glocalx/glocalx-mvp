import { z } from "zod"

import type { Queryable } from "@glocalx/db"

import type { GbpSetupStoreProfileReader } from "../setup"

const confirmedStoreRowSchema = z.object({
  address: z.string(),
  category: z.string(),
  gbp_primary_category_id: z.string().nullable(),
  hours: z.string().nullable(),
  id: z.string(),
  name: z.string(),
  phone: z.string(),
})

// The Queryable-backed counterpart to store-profile.ts's SqliteDatabase-only
// getConfirmedGbpStoreProfile — used wherever setup only has a Queryable (the
// owner-app route via its full StoreProfileRepository, and admin directly).
export function createDatabaseGbpSetupStoreProfileReader(
  queryable: Queryable
): GbpSetupStoreProfileReader {
  return {
    async readConfirmedGbpProfile(storeId) {
      const row = await queryable.queryOne(
        "SELECT id, name, address, phone, category, hours, gbp_primary_category_id FROM stores WHERE id = ? AND phone IS NOT NULL AND EXISTS (SELECT 1 FROM business_profile_extractions WHERE store_id = stores.id AND status = 'CONFIRMED')",
        [storeId]
      )
      const parsed = confirmedStoreRowSchema.safeParse(row)
      if (!parsed.success) {
        return { kind: "missing" }
      }

      return {
        kind: "found",
        profile: {
          address: parsed.data.address,
          category: parsed.data.category,
          ...(parsed.data.hours === null ? {} : { hours: parsed.data.hours }),
          ...(parsed.data.gbp_primary_category_id === null
            ? {}
            : { primaryCategoryId: parsed.data.gbp_primary_category_id }),
          name: parsed.data.name,
          phone: parsed.data.phone,
          storeId: parsed.data.id,
        },
      }
    },
  }
}
