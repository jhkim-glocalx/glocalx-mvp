// Moved to packages/domain so the operator-side publish panel gates on the same
// VERIFIED-only rule the owner app enforces (architecture.md §2: publish_jobs
// reuse the v1 verification gate). Re-exported here for existing importers.
export {
  canUseLiveGbpActions,
  shouldScheduleGbpFollowUp,
} from "@glocalx/domain/gbp-eligibility"
export type { LiveGbpActionResult } from "@glocalx/domain/gbp-eligibility"
