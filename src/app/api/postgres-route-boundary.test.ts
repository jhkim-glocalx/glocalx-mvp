import { describe, expect, it, vi } from "vitest"

import {
  demoSessionCookieName,
  demoStoreCookieName,
  demoStoreId,
  demoUserId,
} from "@/auth/session"
import type { DemoSession } from "@/auth/session"
import type * as ServerHttp from "@/server/http"

import {
  createGbpStore,
  createPerformanceRequest,
  createRouteContext,
  createSessionStore,
  createSetupRequest,
  createStoreProfileRepository,
  type RouteBoundaryContext,
  unexpectedCall,
} from "./postgres-route-boundary.test-support"

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

import { GET as getGbpPerformance } from "./gbp/performance/route"
import { POST as setupGbp } from "./gbp/setup/route"

const demoSession: DemoSession = {
  onboardingComplete: false,
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

describe("Postgres route database boundary", () => {
  it("returns auth-required JSON from the injected session store in GBP setup", async () => {
    const sessionStore = createSessionStore(undefined)
    const gbpStore = createGbpStore()
    installRouteContext(
      createRouteContext({
        gbpStore: gbpStore.store,
        sessionStore: sessionStore.store,
      })
    )

    const response = await setupGbp(createSetupRequest())

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      message: "로그인이 필요합니다.",
      status: "AUTH_REQUIRED",
    })
    expect(sessionStore.reads).toEqual([
      { onboardingComplete: undefined, storeId: undefined, userId: undefined },
    ])
    expect(gbpStore.setupRecords).toEqual([])
  })

  it("persists GBP setup through the injected provider-neutral stores", async () => {
    const sessionStore = createSessionStore(demoSession)
    const gbpStore = createGbpStore()
    const storeProfileRepository = createStoreProfileRepository()
    installRouteContext(
      createRouteContext({
        gbpStore: gbpStore.store,
        sessionStore: sessionStore.store,
        storeProfileRepository: storeProfileRepository.repository,
      })
    )

    const response = await setupGbp(
      createSetupRequest(
        `${demoSessionCookieName}=${demoUserId}; ${demoStoreCookieName}=${demoStoreId}`
      )
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      auditLogId: "route-boundary-audit",
      followUpJobId: "route-boundary-follow-up",
      gbpLocationId: "route-boundary-gbp-location",
      googleLocationId: "route-boundary-google-location",
      message: "GBP setup recorded through injected store.",
      oauthConnectionId: "route-boundary-oauth",
      status: "VERIFICATION_PENDING",
    })
    expect(sessionStore.reads).toEqual([
      {
        onboardingComplete: undefined,
        storeId: demoStoreId,
        userId: demoUserId,
      },
    ])
    expect(storeProfileRepository.profileReads).toEqual([demoStoreId])
    expect(gbpStore.setupRecords).toEqual([
      {
        accountDisplayName: "Stub GBP Account",
        accountName: "accounts/stub",
        googleLocationId: "locations/stub-created",
        mode: "stub",
        now: new Date("2026-06-04T00:00:00.000Z"),
        status: "VERIFICATION_PENDING",
        storeId: demoStoreId,
        subjectId: "stub-google-owner",
      },
    ])
  })

  it("serves GBP performance fallback from the injected store without legacy SQLite", async () => {
    const sessionStore = createSessionStore(demoSession)
    const gbpStore = createGbpStore()
    installRouteContext(
      createRouteContext({
        gbpStore: gbpStore.store,
        sessionStore: sessionStore.store,
      })
    )

    const response = await getGbpPerformance(
      createPerformanceRequest(
        `${demoSessionCookieName}=${demoUserId}; ${demoStoreCookieName}=${demoStoreId}`
      )
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      locationName: "Injected GBP Store",
      status: "READY",
    })
    expect(sessionStore.reads).toEqual([
      {
        onboardingComplete: undefined,
        storeId: demoStoreId,
        userId: demoUserId,
      },
    ])
    expect(gbpStore.performanceLocationReads).toEqual([demoStoreId])
    expect(gbpStore.performanceSummaryReads).toEqual([demoStoreId])
  })
})
