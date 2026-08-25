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
import type { GbpSetupStore } from "@glocalx/gbp-setup"
import { createDatabaseGbpSetupStore } from "@glocalx/gbp-setup/repository/gbp-setup-store"
import type { Queryable } from "@glocalx/db"

// Bundles the setup package's persistence contract with the performance
// dashboard reads that are owner-app-only (unrelated to setup, so they stay
// out of the shared package). Admin composes createDatabaseGbpSetupStore
// directly since it has no performance surface to add.
export interface GbpStore extends GbpSetupStore {
  readPerformanceConnection(storeId: string): Promise<GbpPerformanceConnection>
  readPerformanceLocation(storeId: string): Promise<GbpPerformanceLocation>
  readPerformanceSummaryData(
    storeId: string
  ): Promise<GbpPerformanceSummaryData>
}

export function createDatabaseGbpStore(queryable: Queryable): GbpStore {
  return {
    ...createDatabaseGbpSetupStore(queryable),

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
