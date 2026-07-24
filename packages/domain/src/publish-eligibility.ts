import type {
  PublishChannel,
  StoreChannelLinkStatus,
} from "./campaign-state-machine"
import { canUseLiveGbpActions } from "./gbp-eligibility"
import type { LocationStatus } from "./location-status"

// Per-channel publish gates for the operator's publish panel. Deliberately pure
// and fact-driven: the caller reads the store's GBP location status and
// Instagram linkage, this decides. That keeps the panel's "why is this channel
// greyed out" answer and the publish route's refusal to run the same rule —
// a channel that renders as blocked can never be published by a crafted POST.

export type PublishBlockedCode =
  | "GBP_LOCATION_MISSING"
  | "GBP_LOCATION_NOT_VERIFIED"
  | "INSTAGRAM_NOT_LINKED"
  | "INSTAGRAM_LINK_EXPIRED"
  | "INSTAGRAM_LINK_REVOKED"

export type PublishEligibility =
  | { readonly kind: "eligible" }
  | {
      readonly kind: "blocked"
      readonly code: PublishBlockedCode
      readonly message: string
    }

export type PublishEligibilityFacts = {
  // Undefined means the store has no GBP location row at all — a different
  // operator action (finish GBP setup) than a location that exists but is
  // still working through verification.
  readonly gbpLocationStatus?: LocationStatus | undefined
  readonly instagramLinkStatus?: StoreChannelLinkStatus | undefined
}

const eligible: PublishEligibility = { kind: "eligible" }

function evaluateGbp(status: LocationStatus | undefined): PublishEligibility {
  if (status === undefined) {
    return {
      kind: "blocked",
      code: "GBP_LOCATION_MISSING",
      message:
        "This store has no connected Google Business Profile location yet.",
    }
  }

  // The same VERIFIED-only gate the owner app applies to live posts and review
  // replies — one rule, two callers, so the operator can never publish to a
  // location Google would reject.
  if (canUseLiveGbpActions(status).kind === "allowed") {
    return eligible
  }

  return {
    kind: "blocked",
    code: "GBP_LOCATION_NOT_VERIFIED",
    message: `The Google Business Profile location is "${status}", not verified. Publishing waits for verification.`,
  }
}

function evaluateInstagram(
  status: StoreChannelLinkStatus | undefined
): PublishEligibility {
  switch (status) {
    case "linked":
      return eligible
    case "expired":
      return {
        kind: "blocked",
        code: "INSTAGRAM_LINK_EXPIRED",
        message:
          "The store's Instagram link has expired. Re-link the account before publishing.",
      }
    case "revoked":
      return {
        kind: "blocked",
        code: "INSTAGRAM_LINK_REVOKED",
        message:
          "The store revoked its Instagram link. Re-link the account before publishing.",
      }
    default:
      return {
        kind: "blocked",
        code: "INSTAGRAM_NOT_LINKED",
        message:
          "This store has no linked Instagram business account. Link one before publishing.",
      }
  }
}

export function evaluatePublishEligibility(
  channel: PublishChannel,
  facts: PublishEligibilityFacts
): PublishEligibility {
  switch (channel) {
    case "gbp":
      return evaluateGbp(facts.gbpLocationStatus)
    case "instagram":
      return evaluateInstagram(facts.instagramLinkStatus)
    default: {
      const exhaustiveCheck: never = channel
      throw new Error(`Unhandled publish channel: ${String(exhaustiveCheck)}`)
    }
  }
}
