import type { ConfirmedStoreProfile } from "@/domain/schemas"
import type { ConfirmStoreProfileResult } from "@/onboarding/store-profile"
import type { ConfirmedGbpStoreProfileResult } from "@/gbp/store-profile"

export interface StoreProfileRepository {
  confirmProfile(options: {
    readonly now: Date
    readonly profile: ConfirmedStoreProfile
    readonly storeId: string
  }): ConfirmStoreProfileResult
  readConfirmedGbpProfile(storeId: string): ConfirmedGbpStoreProfileResult
}
