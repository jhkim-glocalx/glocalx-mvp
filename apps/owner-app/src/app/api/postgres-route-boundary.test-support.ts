import { NextRequest } from "next/server"

import type { DemoSession, SessionCookieValues } from "@/auth/session"
import { createIntegrationAdapters } from "@glocalx/integrations"
import type { GbpAccessStore } from "@glocalx/db/support/gbp-access-store"
import type {
  GbpCategorySelectionState,
  GbpCategoryStore,
} from "@/server/repositories/gbp-category-store"
import type { GbpStore } from "@/server/repositories/gbp-store"
import type { SessionStore } from "@/server/repositories/session-store"
import type { StoreProfileRepository } from "@/server/repositories/store-profile"

export type RouteBoundaryContext = {
  readonly adapters: ReturnType<typeof createIntegrationAdapters>
  readonly gbpAccessStore: GbpAccessStore
  readonly gbpCategoryStore: GbpCategoryStore
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
      async createAuthenticatedSession() {
        return unexpectedCall("sessionStore.createAuthenticatedSession")
      },
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
      async persistLiveClaimRequiredRecords() {
        return unexpectedCall("gbpStore.persistLiveClaimRequiredRecords")
      },
      async persistLiveSetupRecords() {
        return unexpectedCall("gbpStore.persistLiveSetupRecords")
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

export function createGbpCategoryStore(options?: {
  readonly selection?: GbpCategorySelectionState
  readonly saveResult?: boolean
}): {
  readonly saves: readonly {
    readonly storeId: string
    readonly categoryId: string
    readonly displayName: string
  }[]
  readonly store: GbpCategoryStore
} {
  const saves: {
    readonly storeId: string
    readonly categoryId: string
    readonly displayName: string
  }[] = []
  return {
    saves,
    store: {
      async savePrimaryCategory(input) {
        saves.push(input)
        return options?.saveResult ?? true
      },
      async readSelection() {
        return options?.selection
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

// A GBP-access store stub that records ensure calls (the only method the setup
// route touches) and rejects the rest — the setup route auto-creates the access
// request on a successful connect.
export function createGbpAccessStore(): {
  readonly store: GbpAccessStore
  readonly ensureCalls: {
    readonly storeId: string
    readonly gbpLocationRef: string | undefined
  }[]
} {
  const ensureCalls: {
    readonly storeId: string
    readonly gbpLocationRef: string | undefined
  }[] = []
  const store: GbpAccessStore = {
    async ensureGbpAccessRequest(input) {
      ensureCalls.push({
        storeId: input.storeId,
        gbpLocationRef: input.gbpLocationRef,
      })
      const timestamp = input.now.toISOString()
      return {
        id: "route-boundary-access",
        storeId: input.storeId,
        gbpLocationRef: input.gbpLocationRef ?? null,
        state: "not_requested",
        note: null,
        requestedAt: timestamp,
        grantedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    },
    async getGbpAccessRequestForStore() {
      return unexpectedCall("gbpAccessStore.getGbpAccessRequestForStore")
    },
    async getGbpAccessRequestById() {
      return unexpectedCall("gbpAccessStore.getGbpAccessRequestById")
    },
    async getGbpAccessListEntryById() {
      return unexpectedCall("gbpAccessStore.getGbpAccessListEntryById")
    },
    async listGbpAccessRequests() {
      return unexpectedCall("gbpAccessStore.listGbpAccessRequests")
    },
    async updateGbpAccessState() {
      return unexpectedCall("gbpAccessStore.updateGbpAccessState")
    },
    async setGbpAccessNote() {
      return unexpectedCall("gbpAccessStore.setGbpAccessNote")
    },
  }
  return { store, ensureCalls }
}

export function createRouteContext(options: {
  readonly gbpStore: GbpStore
  readonly sessionStore: SessionStore
  readonly storeProfileRepository?: StoreProfileRepository
  readonly gbpAccessStore?: GbpAccessStore
  readonly gbpCategoryStore?: GbpCategoryStore
}): RouteBoundaryContext {
  return {
    adapters: createIntegrationAdapters(),
    gbpAccessStore: options.gbpAccessStore ?? createGbpAccessStore().store,
    gbpCategoryStore:
      options.gbpCategoryStore ?? createGbpCategoryStore().store,
    gbpStore: options.gbpStore,
    get legacySqliteDatabase() {
      return unexpectedCall("legacySqliteDatabase")
    },
    sessionStore: options.sessionStore,
    storeProfileRepository:
      options.storeProfileRepository ?? createMissingStoreProfileRepository(),
  }
}
