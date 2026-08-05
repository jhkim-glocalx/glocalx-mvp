import type { NextRequest } from "next/server"

import { gbpCategorySelectionRequestSchema } from "@glocalx/domain"
import {
  findGbpCategoryById,
  searchGbpCategories,
  suggestGbpCategoriesFromNaver,
} from "@/gbp/categories/category-catalog"
import {
  parseJsonRoutePayload,
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

const searchResultLimit = 20

export async function GET(request: NextRequest) {
  return withQueryableRouteDatabase(
    async ({ gbpCategoryStore, sessionStore }) => {
      const session = await readDatabaseSession(request, sessionStore)
      if (session === undefined) {
        return requiredSessionResponse()
      }

      const query = request.nextUrl.searchParams.get("q")?.trim() ?? ""
      if (query !== "") {
        return Response.json({
          matches: searchGbpCategories(query, searchResultLimit),
        })
      }

      // No query: return the current selection (for prefill) plus category
      // suggestions seeded from the store's Naver category.
      const selection = await gbpCategoryStore.readSelection(session.storeId)
      return Response.json({
        ...(selection?.selected === undefined
          ? {}
          : { selected: selection.selected }),
        suggestions:
          selection === undefined
            ? []
            : suggestGbpCategoriesFromNaver(
                selection.naverCategory,
                searchResultLimit
              ),
      })
    }
  )
}

export async function POST(request: NextRequest) {
  const parsed = await parseJsonRoutePayload(
    request,
    gbpCategorySelectionRequestSchema
  )
  if (parsed.kind === "response") {
    return parsed.response
  }

  return withQueryableRouteDatabase(
    async ({ gbpCategoryStore, sessionStore }) => {
      const session = await readDatabaseSession(request, sessionStore)
      if (session === undefined) {
        return requiredSessionResponse()
      }

      // The gcid must exist in the bundled KR catalog — the request schema only
      // guarantees the shape, not that Google actually has this category.
      const category = findGbpCategoryById(parsed.value.categoryId)
      if (category === undefined) {
        return Response.json(
          {
            status: "UNKNOWN_CATEGORY",
            message: "선택한 카테고리를 찾을 수 없습니다.",
          },
          { status: 400 }
        )
      }

      // Ownership: the category is always saved to the session's own store, so a
      // client cannot target another owner's store.
      const saved = await gbpCategoryStore.savePrimaryCategory({
        storeId: session.storeId,
        categoryId: category.categoryId,
        displayName: category.displayName,
      })
      if (!saved) {
        return Response.json(
          { status: "STORE_NOT_FOUND", message: "매장을 찾을 수 없습니다." },
          { status: 404 }
        )
      }

      return Response.json({
        status: "SAVED",
        selected: {
          categoryId: category.categoryId,
          displayName: category.displayName,
        },
      })
    }
  )
}
