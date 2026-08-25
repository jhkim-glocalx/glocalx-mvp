import { openDatabaseContext } from "@glocalx/db"
import { createDatabaseGbpAccessStore } from "@glocalx/db/support/gbp-access-store"
import type { Queryable } from "@glocalx/db/types"

import { createDatabaseGbpStore } from "@glocalx/db/support/gbp-store"

// Onboarding progress lives in React state, so a reload restarts the chat from
// the top. That is survivable for every step the owner drives themselves — they
// are already typing — but not for adoption: the owner is waiting on an operator
// who may take hours, so closing the tab is expected behavior, not an edge case.
// Without a resume they would have to redo the whole Naver extraction just to
// reach a decision that has already been made for them.

export type OnboardingResumeState =
  // Nothing to resume — render the normal chat flow.
  | { readonly kind: "none" }
  // The owner claimed an existing listing and an operator has not ruled yet.
  | { readonly kind: "reviewing" }
  // A listing is attached and ready to publish to, so the owner can finish.
  | { readonly kind: "connected" }

export async function resolveOnboardingResumeState(
  queryable: Queryable,
  storeId: string
): Promise<OnboardingResumeState> {
  const location =
    await createDatabaseGbpStore(queryable).readExistingGbpLocation(storeId)

  // CLAIM_REQUIRED is a listing the owner still has to act on elsewhere, so it
  // is not something to congratulate them about and resume from.
  if (location !== undefined && location.status !== "CLAIM_REQUIRED") {
    return { kind: "connected" }
  }

  const accessRequest =
    await createDatabaseGbpAccessStore(queryable).getGbpAccessRequestForStore(
      storeId
    )

  return accessRequest?.state === "adoption_review"
    ? { kind: "reviewing" }
    : { kind: "none" }
}

export async function readOnboardingResumeState(
  storeId: string
): Promise<OnboardingResumeState> {
  if (storeId === "") {
    return { kind: "none" }
  }

  const databaseContext = await openDatabaseContext()
  try {
    return await resolveOnboardingResumeState(
      databaseContext.queryable,
      storeId
    )
  } finally {
    await databaseContext.close()
  }
}
