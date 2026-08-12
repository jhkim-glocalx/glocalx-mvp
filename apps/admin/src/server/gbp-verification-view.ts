import type { StoreGbpVerification } from "@glocalx/db/support/gbp-verification-store"
import type { GbpVerificationState } from "@glocalx/domain/gbp-verification-state"

// Wire shape the Stores console reads for the listing-verification line on each
// card. Distinct from GbpAccessStoreView: access = "can the org manage the
// listing", verification = "does Google trust the listing". The console joins
// these onto the store cards by storeId; a store with no row simply shows none.
export type StoreVerificationView = {
  readonly storeId: string
  readonly state: GbpVerificationState
  readonly offeredMethods: readonly string[]
  readonly updatedAt: string
}

export function toStoreVerificationView(
  entry: StoreGbpVerification
): StoreVerificationView {
  return {
    storeId: entry.storeId,
    state: entry.state,
    offeredMethods: entry.offeredMethods,
    updatedAt: entry.updatedAt,
  }
}
