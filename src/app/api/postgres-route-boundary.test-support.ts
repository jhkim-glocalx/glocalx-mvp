import { NextRequest } from "next/server"

import type { DemoSession, SessionCookieValues } from "@/auth/session"
import { createIntegrationAdapters } from "@/integrations"
import type { GbpStore } from "@/server/repositories/gbp-store"
import type { SessionStore } from "@/server/repositories/session-store"
import type { StoreProfileRepository } from "@/server/repositories/store-profile"

export type RouteBoundaryContext = {
  readonly adapters: ReturnType<typeof createIntegrationAdapters>
  readonly gbpStore: GbpStore
  readonly legacySqliteDatabase: never
  readonly sessionStore: SessionStore
  readonly storeProfileRepository: StoreProfileRepository
}

export function unexpectedCall(methodName: string): never {
  throw new Error(`${methodName} should not be called`)
}

export function createSetupRequest(cookieHeader?: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/gbp/setup", {
    body: JSON.stringify({ mode: "stub" }),
    headers: {
      ...(cookieHeader === undefined ? {} : { Cookie: cookieHeader }),
      "Content-Type": "application/json",
    },
    method: "POST",
  })
}

export function createPerformanceRequest(cookieHeader: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/gbp/performance", {
    headers: { Cookie: cookieHeader },
    method: "GET",
  })
}

export function createSessionStore(session: DemoSession | undefined): {
  readonly reads: readonly SessionCookieValues[]
  readonly store: SessionStore
} {
  const reads: SessionCookieValues[] = []
  return {
    reads,
    store: {
      async completeOnboarding() {
        return unexpectedCall("sessionStore.completeOnboarding")
      },
      createSession() {
        return unexpectedCall("sessionStore.createSession")
      },
      async isValidStoreOwner() {
        return unexpectedCall("sessionStore.isValidStoreOwner")
      },
      async readSessionFromCookieValues(values) {
        reads.push(values)
        return session
      },
    },
  }
}

export function createGbpStore(): {
  readonly performanceLocationReads: readonly string[]
  readonly performanceSummaryReads: readonly string[]
  readonly setupRecords: readonly Parameters<
    GbpStore["persistSetupRecords"]
  >[0][]
  readonly store: GbpStore
} {
  const performanceLocationReads: string[] = []
  const performanceSummaryReads: string[] = []
  const setupRecords: Parameters<GbpStore["persistSetupRecords"]>[0][] = []
  return {
    performanceLocationReads,
    performanceSummaryReads,
    setupRecords,
    store: {
      async persistClaimRequiredRecords() {
        return unexpectedCall("gbpStore.persistClaimRequiredRecords")
      },
      async persistSetupRecords(options) {
        setupRecords.push(options)
        return {
          auditLogId: "route-boundary-audit",
          followUpJobId: "route-boundary-follow-up",
          gbpLocationId: "route-boundary-gbp-location",
          googleLocationId: "route-boundary-google-location",
          message: "GBP setup recorded through injected store.",
          oauthConnectionId: "route-boundary-oauth",
          status: "VERIFICATION_PENDING",
        }
      },
      async readPerformanceConnection() {
        return unexpectedCall("gbpStore.readPerformanceConnection")
      },
      async readPerformanceLocation(storeId) {
        performanceLocationReads.push(storeId)
        return {
          kind: "ambiguous_gbp_location",
          locationName: "Injected GBP Store",
        }
      },
      async readPerformanceSummaryData(storeId) {
        performanceSummaryReads.push(storeId)
        return {
          category: "Cafe",
          draftCount: 2,
          googleLocationId: "route-boundary-google-location",
          lastSyncedAt: "2026-06-04T00:00:00.000Z",
          locationStatus: "CLAIM_REQUIRED",
          phone: "02-123-4567",
          publishedCount: 1,
          storeName: "Injected GBP Store",
        }
      },
    },
  }
}

export function createStoreProfileRepository(): {
  readonly profileReads: readonly string[]
  readonly repository: StoreProfileRepository
} {
  const profileReads: string[] = []
  return {
    profileReads,
    repository: {
      async confirmProfile() {
        return unexpectedCall("storeProfileRepository.confirmProfile")
      },
      async readConfirmedGbpProfile(storeId) {
        profileReads.push(storeId)
        return {
          kind: "found",
          profile: {
            address: "서울 마포구 와우산로 123",
            category: "브런치 카페",
            hours: "09:00 ~ 18:00",
            name: "브런치모먼트 홍대점",
            phone: "02-123-4567",
            storeId,
          },
        }
      },
    },
  }
}

function createMissingStoreProfileRepository(): StoreProfileRepository {
  return {
    async confirmProfile() {
      return unexpectedCall("storeProfileRepository.confirmProfile")
    },
    async readConfirmedGbpProfile() {
      return unexpectedCall("storeProfileRepository.readConfirmedGbpProfile")
    },
  }
}

export function createRouteContext(options: {
  readonly gbpStore: GbpStore
  readonly sessionStore: SessionStore
  readonly storeProfileRepository?: StoreProfileRepository
}): RouteBoundaryContext {
  return {
    adapters: createIntegrationAdapters(),
    gbpStore: options.gbpStore,
    get legacySqliteDatabase() {
      return unexpectedCall("legacySqliteDatabase")
    },
    sessionStore: options.sessionStore,
    storeProfileRepository:
      options.storeProfileRepository ?? createMissingStoreProfileRepository(),
  }
}
