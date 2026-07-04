import type { LocationStatus } from "@/domain/location-status"
import type {
  GbpPerformanceConnection,
  GbpPerformanceLocation,
} from "@/gbp/performance-repository"
import type {
  BuildClaimRequiredResultOptions,
  GbpSetupResult,
} from "@/gbp/setup"

export interface GbpStore {
  persistClaimRequiredRecords(
    claim: BuildClaimRequiredResultOptions
  ): Promise<void> | void
  persistSetupRecords(options: {
    readonly now: Date
    readonly status: LocationStatus
    readonly storeId: string
    readonly subjectId: string
  }): Promise<GbpSetupResult> | GbpSetupResult
  readPerformanceConnection(storeId: string): GbpPerformanceConnection
  readPerformanceLocation(storeId: string): GbpPerformanceLocation
}
