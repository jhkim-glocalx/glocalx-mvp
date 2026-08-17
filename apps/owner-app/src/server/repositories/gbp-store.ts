import type { LocationStatus } from "@glocalx/domain/location-status"
import type {
  GbpPerformanceConnection,
  GbpPerformanceLocation,
  GbpPerformanceSummaryData,
} from "@/gbp/performance-repository"
import {
  loadGbpPerformanceConnection,
  loadGbpPerformanceLocation,
  loadGbpPerformanceSummaryData,
} from "@/gbp/performance-repository"
import type {
  BuildClaimRequiredResultOptions,
  GbpSetupResult,
} from "@/gbp/setup"
import type { Queryable } from "@glocalx/db"
import {
  persistClaimRequiredGbpRecords,
  persistLiveClaimRequiredGbpRecords,
  persistLiveSetupGbpRecords,
  persistStubSetupGbpRecords,
  readExistingGbpLocation,
} from "./gbp-setup-store"
import type { ExistingGbpLocation } from "./gbp-setup-store"

export interface GbpStore {
  persistClaimRequiredRecords(options: {
    readonly claim: BuildClaimRequiredResultOptions
    readonly now: Date
    readonly storeId: string
  }): Promise<void>
  persistSetupRecords(options: {
    readonly now: Date
    readonly status: LocationStatus
    readonly storeId: string
    readonly subjectId: string
  }): Promise<GbpSetupResult>
  // Live (production) setup persists the real org account + Google location id.
  persistLiveSetupRecords(options: {
    readonly accountName: string
    readonly googleLocationId: string
    readonly now: Date
    readonly status: LocationStatus
    readonly storeId: string
  }): Promise<GbpSetupResult>
  persistLiveClaimRequiredRecords(options: {
    readonly accountName: string
    readonly claim: BuildClaimRequiredResultOptions
    readonly now: Date
    readonly storeId: string
  }): Promise<void>
  // Undefined when the store has no Google listing yet. Setup's duplicate guard
  // reads this before provisioning.
  readExistingGbpLocation(
    storeId: string
  ): Promise<ExistingGbpLocation | undefined>
  readPerformanceConnection(storeId: string): Promise<GbpPerformanceConnection>
  readPerformanceLocation(storeId: string): Promise<GbpPerformanceLocation>
  readPerformanceSummaryData(
    storeId: string
  ): Promise<GbpPerformanceSummaryData>
}

export function createDatabaseGbpStore(queryable: Queryable): GbpStore {
  return {
    async persistClaimRequiredRecords(options) {
      await persistClaimRequiredGbpRecords({
        claim: options.claim,
        now: options.now,
        queryable,
        storeId: options.storeId,
      })
    },

    async persistSetupRecords(options) {
      return persistStubSetupGbpRecords({
        now: options.now,
        queryable,
        status: options.status,
        storeId: options.storeId,
        subjectId: options.subjectId,
      })
    },

    async persistLiveSetupRecords(options) {
      return persistLiveSetupGbpRecords({
        accountName: options.accountName,
        googleLocationId: options.googleLocationId,
        now: options.now,
        queryable,
        status: options.status,
        storeId: options.storeId,
      })
    },

    async persistLiveClaimRequiredRecords(options) {
      await persistLiveClaimRequiredGbpRecords({
        accountName: options.accountName,
        claim: options.claim,
        now: options.now,
        queryable,
        storeId: options.storeId,
      })
    },

    readExistingGbpLocation(storeId) {
      return readExistingGbpLocation(queryable, storeId)
    },

    readPerformanceConnection(storeId) {
      return loadGbpPerformanceConnection(queryable, storeId)
    },

    readPerformanceLocation(storeId) {
      return loadGbpPerformanceLocation(queryable, storeId)
    },

    readPerformanceSummaryData(storeId) {
      return loadGbpPerformanceSummaryData(queryable, storeId)
    },
  }
}
