import { describe, expect, it, vi } from "vitest"

import { NextRequest } from "next/server"

import { demoStoreId, demoUserId } from "@/auth/session"
import type { DemoSession } from "@/auth/session"
import { instagramOAuthStateCookieName } from "@/instagram/oauth-link"
import type * as ServerHttp from "@/server/http"

import {
  createRouteContext,
  createSessionStore,
  createStoreChannelLinkStore,
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

import { GET as connectCallback } from "./route"

const demoSession: DemoSession = {
  onboardingComplete: true,
  storeId: demoStoreId,
  userId: demoUserId,
}

const nonce = "test-nonce"

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

function callbackRequest(options: {
  readonly code: string
  readonly state: string
  readonly cookieValue?: string
}): NextRequest {
  const url = new URL("http://localhost:3000/api/instagram/oauth/callback")
  url.searchParams.set("code", options.code)
  url.searchParams.set("state", options.state)
  const headers: Record<string, string> =
    options.cookieValue === undefined
      ? {}
      : { Cookie: `${instagramOAuthStateCookieName}=${options.cookieValue}` }
  return new NextRequest(url, { method: "GET", headers })
}

// The owner named the account the stub adapter authorizes, so the happy path is
// a clean match; mismatchCookie names a different one.
const boundCookie = `${nonce}:stub_business:${demoStoreId}`
const mismatchCookie = `${nonce}:%40bar_seomyeon:${demoStoreId}`

describe("GET /api/instagram/oauth/callback", () => {
  it("sends an unauthenticated caller back to the entry point without writing", async () => {
    const linkStore = createStoreChannelLinkStore()
    installRouteContext(
      createRouteContext({
        sessionStore: createSessionStore(undefined).store,
        storeChannelLinkStore: linkStore.store,
      })
    )

    const response = await connectCallback(
      callbackRequest({ code: "any", state: nonce, cookieValue: boundCookie })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/")
    expect(linkStore.upserts).toHaveLength(0)
  })

  it("rejects a state mismatch without writing a link", async () => {
    const linkStore = createStoreChannelLinkStore()
    installRouteContext(
      createRouteContext({
        sessionStore: createSessionStore(demoSession).store,
        storeChannelLinkStore: linkStore.store,
      })
    )

    const response = await connectCallback(
      callbackRequest({
        code: "any",
        state: "forged-nonce",
        cookieValue: boundCookie,
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/onboarding?instagram=error")
    expect(linkStore.upserts).toHaveLength(0)
  })

  it("rejects a callback bound to a different store than the session's", async () => {
    const linkStore = createStoreChannelLinkStore()
    installRouteContext(
      createRouteContext({
        sessionStore: createSessionStore(demoSession).store,
        storeChannelLinkStore: linkStore.store,
      })
    )

    const response = await connectCallback(
      callbackRequest({
        code: "any",
        state: nonce,
        cookieValue: `${nonce}:stub_business:some-other-store`,
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/onboarding?instagram=error")
    expect(linkStore.upserts).toHaveLength(0)
  })

  it("writes an encrypted, store-scoped link on a successful stub connect", async () => {
    const linkStore = createStoreChannelLinkStore()
    installRouteContext(
      createRouteContext({
        sessionStore: createSessionStore(demoSession).store,
        storeChannelLinkStore: linkStore.store,
      })
    )

    const response = await connectCallback(
      callbackRequest({
        code: "stub-instagram-code",
        state: nonce,
        cookieValue: boundCookie,
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe(
      "/onboarding?instagram=connected"
    )
    expect(linkStore.upserts).toHaveLength(1)
    const link = linkStore.upserts[0]
    expect(link?.storeId).toBe(demoStoreId)
    expect(link?.channel).toBe("instagram")
    expect(link?.externalAccountRef).toBe("17841400000000000")
    expect(link?.status).toBe("linked")
    // The token is encrypted before it reaches the store — never the raw value.
    expect(link?.encryptedToken).toBeTruthy()
    expect(link?.encryptedToken).not.toBe("stub-instagram-long-lived-token")
    // Both human-readable names are recorded alongside the numeric reference.
    expect(link?.requestedAccountHandle).toBe("stub_business")
    expect(link?.linkedAccountUsername).toBe("stub_business")
    // The one-time state is expired on the way out.
    expect(response.cookies.get(instagramOAuthStateCookieName)?.value).toBe("")
  })

  it("flags a connect that landed on a different account, but still links it", async () => {
    const linkStore = createStoreChannelLinkStore()
    installRouteContext(
      createRouteContext({
        sessionStore: createSessionStore(demoSession).store,
        storeChannelLinkStore: linkStore.store,
      })
    )

    const response = await connectCallback(
      callbackRequest({
        code: "stub-instagram-code",
        state: nonce,
        cookieValue: mismatchCookie,
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe(
      "/onboarding?instagram=connected_other_account"
    )
    // A mismatch is a question for the owner, not a failure: the authorization
    // succeeded, so the link is written and both names are kept for review.
    expect(linkStore.upserts).toHaveLength(1)
    expect(linkStore.upserts[0]?.requestedAccountHandle).toBe("bar_seomyeon")
    expect(linkStore.upserts[0]?.linkedAccountUsername).toBe("stub_business")
  })

  it("does not flag a mismatch when the owner named no account", async () => {
    const linkStore = createStoreChannelLinkStore()
    installRouteContext(
      createRouteContext({
        sessionStore: createSessionStore(demoSession).store,
        storeChannelLinkStore: linkStore.store,
      })
    )

    const response = await connectCallback(
      callbackRequest({
        code: "stub-instagram-code",
        state: nonce,
        cookieValue: `${nonce}::${demoStoreId}`,
      })
    )

    expect(response.headers.get("Location")).toBe(
      "/onboarding?instagram=connected"
    )
    expect(linkStore.upserts[0]?.requestedAccountHandle).toBeNull()
  })

  it("maps a personal account to the needs-professional flag, writing no link", async () => {
    const linkStore = createStoreChannelLinkStore()
    installRouteContext(
      createRouteContext({
        sessionStore: createSessionStore(demoSession).store,
        storeChannelLinkStore: linkStore.store,
      })
    )

    const response = await connectCallback(
      callbackRequest({
        code: "personal-account",
        state: nonce,
        cookieValue: boundCookie,
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe(
      "/onboarding?instagram=needs_professional_account"
    )
    expect(linkStore.upserts).toHaveLength(0)
  })

  it("maps an upstream failure to an opaque error flag, never a raw reason", async () => {
    const linkStore = createStoreChannelLinkStore()
    installRouteContext(
      createRouteContext({
        sessionStore: createSessionStore(demoSession).store,
        storeChannelLinkStore: linkStore.store,
      })
    )

    const response = await connectCallback(
      callbackRequest({
        code: "oauth-fail",
        state: nonce,
        cookieValue: boundCookie,
      })
    )

    expect(response.status).toBe(303)
    expect(response.headers.get("Location")).toBe("/onboarding?instagram=error")
    expect(linkStore.upserts).toHaveLength(0)
  })
})
