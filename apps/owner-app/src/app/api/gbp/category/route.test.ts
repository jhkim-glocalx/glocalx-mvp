import { describe, expect, it, vi } from "vitest"

import { NextRequest } from "next/server"

import { demoStoreId, demoUserId } from "@/auth/session"
import type { DemoSession } from "@/auth/session"
import { gbpCategoryCatalog } from "@/gbp/categories/category-catalog"
import type * as ServerHttp from "@/server/http"

import {
  createGbpCategoryStore,
  createGbpStore,
  createRouteContext,
  createSessionStore,
  type RouteBoundaryContext,
  unexpectedCall,
} from "../../postgres-route-boundary.test-support"

const routeDatabaseBoundaryMocks = vi.hoisted(() => ({
  withQueryableRouteDatabase: vi.fn(),
}))

vi.mock("@/server/http", async (importOriginal) => {
  const actual = await importOriginal<typeof ServerHttp>()
  return {
    ...actual,
    withQueryableRouteDatabase:
      routeDatabaseBoundaryMocks.withQueryableRouteDatabase,
  }
})

import { GET as getCategory, POST as postCategory } from "./route"

const demoSession: DemoSession = {
  onboardingComplete: true,
  storeId: demoStoreId,
  userId: demoUserId,
}

let routeContext: RouteBoundaryContext

async function runRouteHandler(handler: unknown): Promise<Response> {
  if (!(handler instanceof Function)) {
    return unexpectedCall("withQueryableRouteDatabase handler")
  }
  const value: unknown = await Reflect.apply(handler, undefined, [routeContext])
  if (value instanceof Response) {
    return value
  }
  return unexpectedCall("withQueryableRouteDatabase response")
}

function installRouteContext(context: RouteBoundaryContext): void {
  routeContext = context
  routeDatabaseBoundaryMocks.withQueryableRouteDatabase.mockReset()
  routeDatabaseBoundaryMocks.withQueryableRouteDatabase.mockImplementation(
    runRouteHandler
  )
}

function getRequest(query?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/gbp/category")
  if (query !== undefined) {
    url.searchParams.set("q", query)
  }
  return new NextRequest(url, { method: "GET" })
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/gbp/category", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
}

const knownCategory = gbpCategoryCatalog()[0]
if (knownCategory === undefined) {
  throw new Error("GBP category catalog must not be empty")
}

describe("GET /api/gbp/category", () => {
  it("requires a session", async () => {
    installRouteContext(
      createRouteContext({
        gbpStore: createGbpStore().store,
        sessionStore: createSessionStore(undefined).store,
      })
    )

    const response = await getCategory(getRequest())

    expect(response.status).toBe(401)
  })

  it("returns ranked matches for a search query", async () => {
    installRouteContext(
      createRouteContext({
        gbpStore: createGbpStore().store,
        sessionStore: createSessionStore(demoSession).store,
      })
    )

    const response = await getCategory(getRequest("카페"))
    const body = (await response.json()) as {
      matches: { categoryId: string; displayName: string }[]
    }

    expect(response.status).toBe(200)
    expect(body.matches.length).toBeGreaterThan(0)
    expect(
      body.matches.every((match) => match.displayName.includes("카페"))
    ).toBe(true)
  })

  it("returns the current selection and Naver-seeded suggestions with no query", async () => {
    installRouteContext(
      createRouteContext({
        gbpStore: createGbpStore().store,
        sessionStore: createSessionStore(demoSession).store,
        gbpCategoryStore: createGbpCategoryStore({
          selection: {
            naverCategory: "카페,디저트",
            selected: {
              categoryId: knownCategory.categoryId,
              displayName: knownCategory.displayName,
            },
          },
        }).store,
      })
    )

    const response = await getCategory(getRequest())
    const body = (await response.json()) as {
      selected?: { categoryId: string }
      suggestions: { displayName: string }[]
    }

    expect(response.status).toBe(200)
    expect(body.selected?.categoryId).toBe(knownCategory.categoryId)
    expect(body.suggestions.length).toBeGreaterThan(0)
  })
})

describe("POST /api/gbp/category", () => {
  it("requires a session", async () => {
    installRouteContext(
      createRouteContext({
        gbpStore: createGbpStore().store,
        sessionStore: createSessionStore(undefined).store,
      })
    )

    const response = await postCategory(
      postRequest({ categoryId: knownCategory.categoryId })
    )

    expect(response.status).toBe(401)
  })

  it("rejects a malformed category id before any store write", async () => {
    const categoryStore = createGbpCategoryStore()
    installRouteContext(
      createRouteContext({
        gbpStore: createGbpStore().store,
        sessionStore: createSessionStore(demoSession).store,
        gbpCategoryStore: categoryStore.store,
      })
    )

    const response = await postCategory(
      postRequest({ categoryId: "not-a-gcid" })
    )

    expect(response.status).toBe(400)
    expect(categoryStore.saves).toHaveLength(0)
  })

  it("rejects a well-formed but unknown category id", async () => {
    const categoryStore = createGbpCategoryStore()
    installRouteContext(
      createRouteContext({
        gbpStore: createGbpStore().store,
        sessionStore: createSessionStore(demoSession).store,
        gbpCategoryStore: categoryStore.store,
      })
    )

    const response = await postCategory(
      postRequest({ categoryId: "categories/gcid:not_a_real_category" })
    )
    const body = (await response.json()) as { status: string }

    expect(response.status).toBe(400)
    expect(body.status).toBe("UNKNOWN_CATEGORY")
    expect(categoryStore.saves).toHaveLength(0)
  })

  it("persists a valid category to the session store and echoes it", async () => {
    const categoryStore = createGbpCategoryStore()
    installRouteContext(
      createRouteContext({
        gbpStore: createGbpStore().store,
        sessionStore: createSessionStore(demoSession).store,
        gbpCategoryStore: categoryStore.store,
      })
    )

    const response = await postCategory(
      postRequest({ categoryId: knownCategory.categoryId })
    )
    const body = (await response.json()) as {
      status: string
      selected: { categoryId: string; displayName: string }
    }

    expect(response.status).toBe(200)
    expect(body.status).toBe("SAVED")
    expect(body.selected).toEqual({
      categoryId: knownCategory.categoryId,
      displayName: knownCategory.displayName,
    })
    expect(categoryStore.saves).toEqual([
      {
        storeId: demoStoreId,
        categoryId: knownCategory.categoryId,
        displayName: knownCategory.displayName,
      },
    ])
  })

  it("returns 404 when the session store row is missing", async () => {
    const categoryStore = createGbpCategoryStore({ saveResult: false })
    installRouteContext(
      createRouteContext({
        gbpStore: createGbpStore().store,
        sessionStore: createSessionStore(demoSession).store,
        gbpCategoryStore: categoryStore.store,
      })
    )

    const response = await postCategory(
      postRequest({ categoryId: knownCategory.categoryId })
    )

    expect(response.status).toBe(404)
  })
})
