import type { Queryable } from "@glocalx/db"
import { z } from "zod"

const selectionRowSchema = z.object({
  category: z.string(),
  gbp_primary_category_id: z.string().nullable(),
  gbp_primary_category_display_name: z.string().nullable(),
})

export type GbpCategorySelectionState = {
  // The Naver-derived free-text category, used to pre-seed the picker.
  readonly naverCategory: string
  readonly selected?: {
    readonly categoryId: string
    readonly displayName: string
  }
}

export interface GbpCategoryStore {
  // Returns false when no store row matched (unknown/foreign store id), so the
  // route can surface a 404 rather than silently succeeding.
  savePrimaryCategory(options: {
    readonly storeId: string
    readonly categoryId: string
    readonly displayName: string
  }): Promise<boolean>
  readSelection(storeId: string): Promise<GbpCategorySelectionState | undefined>
}

export function createDatabaseGbpCategoryStore(
  queryable: Queryable
): GbpCategoryStore {
  return {
    async savePrimaryCategory(options) {
      const result = await queryable.execute(
        "UPDATE stores SET gbp_primary_category_id = ?, gbp_primary_category_display_name = ? WHERE id = ?",
        [options.categoryId, options.displayName, options.storeId]
      )
      return result.changes > 0
    },

    async readSelection(storeId) {
      const row = await queryable.queryOne(
        "SELECT category, gbp_primary_category_id, gbp_primary_category_display_name FROM stores WHERE id = ?",
        [storeId]
      )
      const parsed = selectionRowSchema.safeParse(row)
      if (!parsed.success) {
        return undefined
      }

      const { gbp_primary_category_id, gbp_primary_category_display_name } =
        parsed.data
      const selected =
        gbp_primary_category_id !== null &&
        gbp_primary_category_display_name !== null
          ? {
              categoryId: gbp_primary_category_id,
              displayName: gbp_primary_category_display_name,
            }
          : undefined

      return {
        naverCategory: parsed.data.category,
        ...(selected === undefined ? {} : { selected }),
      }
    },
  }
}
