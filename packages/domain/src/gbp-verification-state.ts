import { z } from "zod"

// Interprets Google's mybusinessverifications signals — the VoiceOfMerchantState
// resource plus the fetchVerificationOptions method list — into the single state
// our owner card and the operator concierge queue render.
//
// Grounded in a live probe (2026-08-11) on a freshly app-created KR listing:
// Google offered AUTO, verify(AUTO) returned COMPLETED instantly, then Google
// async-reverted Voice of Merchant (hasBusinessAuthority true→false) and dropped
// the API methods to zero (UI/video only). So `hasVoiceOfMerchant` is the trusted
// signal, never the verify call's immediate response — a new listing must be
// re-checked (on-view) after any verify attempt.

export const gbpVerificationStates = [
  // Google granted Voice of Merchant — it trusts the listing as verified.
  "VERIFIED",
  // A verification is accepted and under Google's async review
  // (waitForVoiceOfMerchant), e.g. right after verify(AUTO). No owner/operator
  // action helps; re-check later.
  "PENDING_REVIEW",
  // Verification is required and Google offers an API-drivable method
  // (postcard/phone/SMS/email) we can guide in-app via completeVerification.
  "NEEDS_VERIFICATION",
  // Verification is required but Google offers no API-drivable method (zero
  // options, or only AUTO/VET_BY_GOOGLE) — a UI/video flow API cannot drive.
  // This is the operator live-assist (concierge) path.
  "NEEDS_CONCIERGE",
  // The state could not be read (network/parse failure). Distinct from a real
  // Google verdict so a transient read miss never masquerades as "verified".
  "UNKNOWN",
] as const

export type GbpVerificationState = (typeof gbpVerificationStates)[number]

export const gbpVerificationStateSchema = z.enum(gbpVerificationStates)

// The owner never sees the five internal states. As with GBP access, they see a
// coarse three-way status: still moving ("we're on it"), done, or "a person will
// help you" — never a technical dead end. Both NEEDS_VERIFICATION and
// NEEDS_CONCIERGE collapse to "attention" because there is no owner-driven PIN UI
// yet; the operator concierge (Model A) handles both today. Owner status route
// and owner card read this one mapping so they can't disagree.
export type GbpVerificationOwnerPhase = "in_progress" | "verified" | "attention"

const ownerPhaseByVerificationState: Readonly<
  Record<GbpVerificationState, GbpVerificationOwnerPhase>
> = {
  VERIFIED: "verified",
  PENDING_REVIEW: "in_progress",
  UNKNOWN: "in_progress",
  NEEDS_VERIFICATION: "attention",
  NEEDS_CONCIERGE: "attention",
}

export function gbpVerificationOwnerPhase(
  state: GbpVerificationState
): GbpVerificationOwnerPhase {
  return ownerPhaseByVerificationState[state]
}

// Methods completeVerification can drive from our own native UI (PIN entry etc.).
// AUTO is Google's opportunistic instant path (attempted, never trusted);
// VET_BY_GOOGLE is a Google-side manual review — neither is owner-drivable, so
// neither counts toward NEEDS_VERIFICATION.
export const apiDrivableVerificationMethods = [
  "ADDRESS",
  "PHONE_CALL",
  "SMS",
  "EMAIL",
] as const

// Loose parsers: Google adds fields over time, so pick only what we interpret and
// passthrough the rest. Every field is optional — a partial body must never throw.
export const voiceOfMerchantStateSchema = z
  .object({
    hasVoiceOfMerchant: z.boolean().optional(),
    hasBusinessAuthority: z.boolean().optional(),
    verify: z.unknown().optional(),
    waitForVoiceOfMerchant: z.unknown().optional(),
    complyWithGuidelines: z.unknown().optional(),
  })
  .passthrough()

export type VoiceOfMerchantState = z.infer<typeof voiceOfMerchantStateSchema>

export const verificationOptionSchema = z
  .object({ verificationMethod: z.string() })
  .passthrough()

export const fetchVerificationOptionsResponseSchema = z
  .object({ options: z.array(verificationOptionSchema).optional() })
  .passthrough()

export function parseVerificationOptionMethods(
  payload: unknown
): readonly string[] {
  const parsed = fetchVerificationOptionsResponseSchema.safeParse(payload)
  if (!parsed.success) {
    return []
  }
  return (parsed.data.options ?? []).map((option) => option.verificationMethod)
}

export type GbpVerificationSnapshot = {
  readonly voiceOfMerchant: VoiceOfMerchantState | undefined
  readonly offeredMethods: readonly string[]
}

function hasApiDrivableMethod(methods: readonly string[]): boolean {
  return methods.some((method) =>
    apiDrivableVerificationMethods.some((drivable) => drivable === method)
  )
}

export function interpretGbpVerificationState(
  snapshot: GbpVerificationSnapshot
): GbpVerificationState {
  const vom = snapshot.voiceOfMerchant
  if (vom === undefined) {
    return "UNKNOWN"
  }
  if (vom.hasVoiceOfMerchant === true) {
    return "VERIFIED"
  }
  // Google is actively reviewing an accepted verification — wait, don't prompt.
  if (vom.waitForVoiceOfMerchant !== undefined) {
    return "PENDING_REVIEW"
  }
  // A verify step is required. If any offered method is API-drivable the
  // owner/operator can complete it in-app; otherwise only Google's UI/video flow
  // remains and this becomes a concierge case.
  if (vom.verify !== undefined) {
    return hasApiDrivableMethod(snapshot.offeredMethods)
      ? "NEEDS_VERIFICATION"
      : "NEEDS_CONCIERGE"
  }
  // No voice of merchant, no pending review, no verify affordance — nothing
  // actionable is exposed, so treat it as a concierge case rather than "verified".
  return "NEEDS_CONCIERGE"
}
