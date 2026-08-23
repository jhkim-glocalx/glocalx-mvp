import { z } from "zod"

// Organization GBP manager-access state (architecture.md "GBP organization
// access"). Operators drive every hop by hand — there is no automated Google
// polling in v2 — so this machine's whole job is to reject an incoherent jump,
// not to advance anything on its own. It is unrelated to the v1 location
// verification machine in gbp-eligibility.ts, which gates publishing.
// `adoption_review` is the one state waiting on *us* rather than on the owner or
// Google: the owner said in onboarding that this store is already live on a
// listing our org account owns, and an operator has to confirm that match before
// anything is attached. Deliberately not named after "claim" — that word already
// means requesting admin rights on someone *else's* listing
// (requestAdminRightsUrl), which is the opposite direction of trust.
// The states CONFIRM_ADOPTION may proceed from. Exported as data (not just
// encoded in the transition) so route-level guards can mirror the machine
// without hand-copying the list — drift there fails silently successful.
export const confirmAdoptionSourceStates = [
  "adoption_review",
  "blocked",
] as const

export const gbpAccessStateSchema = z.enum([
  "not_requested",
  "adoption_review",
  "invited",
  "pending",
  "granted",
  "revoked",
  "blocked",
])
export type GbpAccessState = z.infer<typeof gbpAccessStateSchema>

export const gbpAccessStates = gbpAccessStateSchema.options

// The owner sees a coarse three-way status, not the six operator states: the
// flow is either still moving toward access, done, or stuck and needing a human.
// Both the owner status route (which returns the phase) and the owner UI (which
// renders copy per phase) read this one mapping so they can't disagree.
export type GbpAccessOwnerPhase = "in_progress" | "granted" | "attention"

const ownerPhaseByState: Readonly<Record<GbpAccessState, GbpAccessOwnerPhase>> =
  {
    not_requested: "in_progress",
    // The owner has done their part and is waiting on an operator, so this reads
    // as ordinary progress — never as something the owner must act on again.
    adoption_review: "in_progress",
    invited: "in_progress",
    pending: "in_progress",
    granted: "granted",
    // revoked/blocked are the only states an owner can't wait their way out of —
    // they route to chat ("attention"), never a dead end.
    revoked: "attention",
    blocked: "attention",
  }

export function gbpAccessOwnerPhase(
  state: GbpAccessState
): GbpAccessOwnerPhase {
  return ownerPhaseByState[state]
}

// The natural operator vocabulary (SEND_INVITE/MARK_PENDING/GRANT/REVOKE/BLOCK)
// walks the owner-visible progression; OVERRIDE is the audited escape hatch for
// out-of-band grants and corrections. Keeping the two apart lets the audit log
// distinguish "the flow advanced" from "an operator forced a state".
//
// CONFIRM_ADOPTION/REJECT_ADOPTION are the operator's verdict on an owner's
// "이미 등록했어요" claim. They are natural actions, not overrides: the operator
// is answering a question the owner asked, which is exactly the guided flow.
export type GbpAccessAction =
  | { readonly type: "SEND_INVITE" }
  | { readonly type: "MARK_PENDING" }
  // gbpLocationRef is the listing the operator picked. Optional because the
  // matcher's guess stands when the operator does not override it, and required
  // in effect when the matcher found nothing — the transition refuses to confirm
  // a claim that would attach no listing.
  | {
      readonly type: "CONFIRM_ADOPTION"
      readonly gbpLocationRef?: string | undefined
    }
  // reason is what the owner is actually told: it becomes the assistant message
  // in their chat thread. A rejection with no reason leaves them staring at
  // "확인이 필요합니다" with nothing to answer, so the console requires one.
  | { readonly type: "REJECT_ADOPTION"; readonly reason: string }
  | { readonly type: "GRANT" }
  | { readonly type: "REVOKE" }
  // reason is `string | undefined` (not just optional) so the value parsed from
  // gbpAccessActionRequestSchema assigns cleanly under exactOptionalPropertyTypes.
  | { readonly type: "BLOCK"; readonly reason?: string | undefined }
  | { readonly type: "OVERRIDE"; readonly targetState: GbpAccessState }

// Wire form of GbpAccessAction the admin transition route accepts. Parses
// straight into the action union, so the route never hand-assembles an action
// from loose fields. `.strict()` on each member keeps a BLOCK from smuggling a
// targetState or an OVERRIDE from arriving without one.
export const gbpAccessActionRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SEND_INVITE") }).strict(),
  z.object({ type: z.literal("MARK_PENDING") }).strict(),
  z
    .object({
      type: z.literal("CONFIRM_ADOPTION"),
      gbpLocationRef: z.string().trim().min(1).max(300).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("REJECT_ADOPTION"),
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  z.object({ type: z.literal("GRANT") }).strict(),
  z.object({ type: z.literal("REVOKE") }).strict(),
  z
    .object({
      type: z.literal("BLOCK"),
      reason: z.string().trim().min(1).max(500).optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("OVERRIDE"), targetState: gbpAccessStateSchema })
    .strict(),
])

// Operator chase-note edit. Non-empty and bounded; the note is operator text
// about the store, never owner content.
export const gbpAccessNoteRequestSchema = z
  .object({ note: z.string().trim().min(1).max(500) })
  .strict()

export type GbpAccessNoteRequest = z.infer<typeof gbpAccessNoteRequestSchema>

export class InvalidGbpAccessTransitionError extends Error {
  constructor(
    public readonly currentState: GbpAccessState,
    public readonly actionType: string,
    message?: string
  ) {
    super(
      message ??
        `Invalid GBP access transition from "${currentState}" via action "${actionType}".`
    )
    this.name = "InvalidGbpAccessTransitionError"
  }
}

function fromStates(
  current: GbpAccessState,
  actionType: string,
  allowed: readonly GbpAccessState[],
  next: GbpAccessState
): GbpAccessState {
  if (!allowed.includes(current)) {
    throw new InvalidGbpAccessTransitionError(
      current,
      actionType,
      `Cannot ${actionType} from state "${current}". Must be one of: ${allowed.join(", ")}.`
    )
  }
  return next
}

export function transitionGbpAccess(
  currentState: GbpAccessState,
  action: GbpAccessAction
): GbpAccessState {
  switch (action.type) {
    // blocked is a recoverable detour, so each forward step also accepts it as a
    // source: an operator who cleared whatever blocked the request resumes the
    // flow without needing an override.
    case "SEND_INVITE":
      return fromStates(
        currentState,
        action.type,
        ["not_requested", "blocked"],
        "invited"
      )

    case "MARK_PENDING":
      return fromStates(
        currentState,
        action.type,
        ["invited", "blocked"],
        "pending"
      )

    // Straight to granted with no invite hop: the org account already manages
    // this listing, so confirming the owner's claim is recognizing access that
    // exists rather than requesting it. Accepts blocked as a source like the
    // other forward steps — an operator who first rejected a claim and then
    // found it was right resumes without an override.
    case "CONFIRM_ADOPTION":
      return fromStates(
        currentState,
        action.type,
        confirmAdoptionSourceStates,
        "granted"
      )

    // Rejection parks the store in blocked rather than resetting it, which is
    // the point: blocked maps to the owner phase "attention", so the owner is
    // told a human is looking rather than being silently dropped back into the
    // flow that would create a *second* listing. Nothing resumes here until an
    // operator acts, which is exactly the guarantee a wrong rejection needs.
    // Only from adoption_review — there is no claim to reject in any other state.
    case "REJECT_ADOPTION":
      return fromStates(
        currentState,
        action.type,
        ["adoption_review"],
        "blocked"
      )

    // Reachable from invited too: an owner can grant access before the operator
    // has marked the request pending, so the natural path collapses that hop.
    case "GRANT":
      return fromStates(
        currentState,
        action.type,
        ["invited", "pending", "blocked"],
        "granted"
      )

    case "REVOKE":
      return fromStates(currentState, action.type, ["granted"], "revoked")

    // A settled granted/revoked request is not "blocked"; use OVERRIDE to move
    // it deliberately.
    case "BLOCK":
      return fromStates(
        currentState,
        action.type,
        ["not_requested", "invited", "pending"],
        "blocked"
      )

    case "OVERRIDE": {
      // The one thing an override refuses is a no-op, so an "override" entry in
      // the audit log always marks a real change of state.
      if (action.targetState === currentState) {
        throw new InvalidGbpAccessTransitionError(
          currentState,
          action.type,
          `Override target "${action.targetState}" is already the current state; nothing to change.`
        )
      }
      return action.targetState
    }

    default: {
      const _exhaustiveCheck: never = action
      throw new Error(`Unhandled action: ${JSON.stringify(_exhaustiveCheck)}`)
    }
  }
}
