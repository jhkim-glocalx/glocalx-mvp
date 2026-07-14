import type { LocationStatus } from "@/domain/location-status"
import type { OAuthIdentityProfile } from "@/auth/oauth-identity"
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
import { persistGoogleOAuthConnection } from "./gbp-setup-auth-audit-store"
import {
  consumeGbpRegistrationIntent,
  createGbpRegistrationIntent,
} from "./gbp-registration-intent-store"

export interface GbpStore {
  createRegistrationIntent(options: {
    readonly googleSubjectId: string
    readonly now: Date
    readonly payloadDigest: string
    readonly storeId: string
  }): Promise<string>
  consumeRegistrationIntent(options: {
    readonly googleSubjectId: string
    readonly id: string
    readonly now: Date
    readonly payloadDigest: string
    readonly storeId: string
  }): Promise<boolean>
  persistGoogleConnection(options: {
    readonly now: Date
    readonly profile: OAuthIdentityProfile
    readonly storeId: string
  }): Promise<void>
  persistClaimRequiredRecords(options: {
    readonly claim: BuildClaimRequiredResultOptions
    readonly mode: "stub" | "production"
    readonly now: Date
    readonly storeId: string
  }): Promise<void>
  persistSetupRecords(options: {
    readonly accountDisplayName: string
    readonly accountName: string
    readonly googleLocationId: string
    readonly mode: "stub" | "production"
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
    consumeRegistrationIntent(options) {
      return consumeGbpRegistrationIntent({ ...options, queryable })
    },
    createRegistrationIntent(options) {
      return createGbpRegistrationIntent({ ...options, queryable })
    },
    async persistGoogleConnection(options) {
      await persistGoogleOAuthConnection({ ...options, queryable })
    },
    async persistClaimRequiredRecords(options) {
      await queryable.transaction(async (transaction) => {
        await persistClaimRequiredGbpRecords({
          claim: options.claim,
          mode: options.mode,
          now: options.now,
          queryable: transaction,
          storeId: options.storeId,
        })
      })
    },

    async persistSetupRecords(options) {
      let result: GbpSetupResult | undefined
      await queryable.transaction(async (transaction) => {
        result = await persistStubSetupGbpRecords({
          accountDisplayName: options.accountDisplayName,
          accountName: options.accountName,
          googleLocationId: options.googleLocationId,
          mode: options.mode,
          now: options.now,
          queryable: transaction,
          status: options.status,
          storeId: options.storeId,
          subjectId: options.subjectId,
        })
      })
      if (result === undefined) {
        throw new Error("GBP setup transaction completed without a result")
      }
      return result
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
