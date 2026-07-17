import type { ConfirmedStoreProfile } from "@/domain/schemas"
import type { IntegrationAdapters } from "@/integrations/contracts"
import type { StoreProfileRepository } from "@/server/repositories/store-profile"

export type ConfirmStoreProfileOptions = {
  readonly adapters: IntegrationAdapters
  readonly profile: ConfirmedStoreProfile
  readonly repository: StoreProfileRepository
  readonly storeId: string
}

export type ConfirmStoreProfileResult = {
  readonly status: "CONFIRMED"
  readonly extractionId: string
  readonly message: string
}

export function confirmedExtractionId(storeId: string): string {
  // One confirmed snapshot per store keeps confirmation idempotent across repeated submit attempts.
  return `confirmed-extraction-${storeId}`
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
