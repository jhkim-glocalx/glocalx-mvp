import type { LocationStatus } from "@/domain/location-status"
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
import type { Queryable } from "@/server/db"
import {
  persistClaimRequiredGbpRecords,
  persistStubSetupGbpRecords,
} from "./gbp-setup-store"

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
