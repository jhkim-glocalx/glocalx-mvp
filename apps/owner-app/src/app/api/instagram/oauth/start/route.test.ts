import { describe, expect, it, vi } from "vitest"

import { NextRequest } from "next/server"

import { demoStoreId, demoUserId } from "@/auth/session"
import type { DemoSession } from "@/auth/session"
import {
  instagramOAuthStateCookieName,
  stubInstagramConnectCode,
} from "@/instagram/oauth-link"
import type * as ServerHttp from "@/server/http"

import {
  createRouteContext,
  createSessionStore,
  type RouteBoundaryContext,
  unexpectedCall,
} from "../../../postgres-route-boundary.test-support"

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

import { POST as startConnect } from "./route"

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

function startRequest(options?: {
  readonly accountHandle?: string
  readonly sameOrigin?: boolean
}): NextRequest {
  const url = "http://localhost:3000/api/instagram/oauth/start"
  const headers: Record<string, string> =
    options?.sameOrigin === false ? {} : { origin: "http://localhost:3000" }
  if (options?.accountHandle === undefined) {
    return new NextRequest(url, { method: "POST", headers })
  }
  const body = new FormData()
  body.set("accountHandle", options.accountHandle)
  return new NextRequest(url, { method: "POST", headers, body })
}

describe("POST /api/instagram/oauth/start", () => {
  it("rejects a cross-origin submission before touching the session", async () => {
    installRouteContext(
      createRouteContext({
        sessionStore: createSessionStore(demoSession).store,
      })
    )

    const response = await startConnect(startRequest({ sameOrigin: false }))

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/onboarding?instagram=error")
    expect(response.cookies.get(instagramOAuthStateCookieName)).toBeUndefined()
  })

  it("sends an unauthenticated caller back to the entry point", async () => {
    installRouteContext(
      createRouteContext({
        sessionStore: createSessionStore(undefined).store,
      })
    )

    const response = await startConnect(startRequest())

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/")
  })

  it("drives its own callback with a state cookie bound to the store in stub mode", async () => {
    installRouteContext(
      createRouteContext({
        sessionStore: createSessionStore(demoSession).store,
      })
    )

    const response = await startConnect(
      startRequest({ accountHandle: "@bar_seomyeon" })
    )

    expect(response.status).toBe(303)
    const location = response.headers.get("Location") ?? ""
    const target = new URL(location, "http://localhost:3000")
    expect(target.pathname).toBe("/api/instagram/oauth/callback")
    expect(target.searchParams.get("code")).toBe(stubInstagramConnectCode)

    const nonce = target.searchParams.get("state")
    expect(nonce).toBeTruthy()
    // The cookie binds that same nonce to the session's store, so the callback
    // can enforce both replay protection and store ownership — and carries the
    // account the owner named, so the callback can compare it with the one Meta
    // actually authorized.
    expect(response.cookies.get(instagramOAuthStateCookieName)?.value).toBe(
      `${nonce}:%40bar_seomyeon:${demoStoreId}`
    )
  })

  it("still starts the flow when the owner submits no account name", async () => {
    installRouteContext(
      createRouteContext({
        sessionStore: createSessionStore(demoSession).store,
      })
    )

    const response = await startConnect(startRequest())

    expect(response.status).toBe(303)
    const nonce = new URL(
      response.headers.get("Location") ?? "",
      "http://localhost:3000"
    ).searchParams.get("state")
    expect(response.cookies.get(instagramOAuthStateCookieName)?.value).toBe(
      `${nonce}::${demoStoreId}`
    )
  })
})
