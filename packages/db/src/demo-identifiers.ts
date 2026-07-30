export const demoUserId = "demo-owner"
export const demoStoreId = "demo-store"

// Phase 5 cohort dataset: additional stores owned by demoUserId that place the
// operator consoles across every pipeline state (onboarding, GBP access,
// campaign queue, chat inbox). Each id is stable so tests and the runbook can
// point at a specific scenario. demo-store stays the happy path and, being the
// oldest store, is still the one oauth-identity's "oldest store" login resolves.
export const demoCohortStoreIds = {
  onboarding: "demo-store-onboarding",
  invited: "demo-store-invited",
  pending: "demo-store-pending",
  review: "demo-store-review",
  partial: "demo-store-partial",
  blocked: "demo-store-blocked",
} as const

export type DemoCohortStoreKey = keyof typeof demoCohortStoreIds
