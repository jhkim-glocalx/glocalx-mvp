import type { ConfirmedStoreProfile } from "@glocalx/domain"
import type { IntegrationAdapters } from "@glocalx/integrations/contracts"
import type { StoreProfileRepository } from "@glocalx/db/support/store-profile"
// Moved to packages/domain so packages/db's store-profile repository can share
// the same idempotency-key derivation and result shape without depending on
// the owner app. Re-exported here for existing importers.
export {
  confirmedExtractionId,
  type ConfirmStoreProfileResult,
} from "@glocalx/domain/store-profile-confirmation"
import type { ConfirmStoreProfileResult } from "@glocalx/domain/store-profile-confirmation"

export type ConfirmStoreProfileOptions = {
  readonly adapters: IntegrationAdapters
  readonly profile: ConfirmedStoreProfile
  readonly repository: StoreProfileRepository
  readonly storeId: string
}

export async function confirmStoreProfile(
  options: ConfirmStoreProfileOptions
): Promise<ConfirmStoreProfileResult> {
  return options.repository.confirmProfile({
    now: options.adapters.clock.now(),
    profile: options.profile,
    storeId: options.storeId,
  })
}
