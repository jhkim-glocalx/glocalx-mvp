import { z } from "zod"

// Organization GBP manager-access state (architecture.md "GBP organization
// access"). Operators drive every hop by hand — there is no automated Google
// polling in v2 — so this machine's whole job is to reject an incoherent jump,
// not to advance anything on its own. It is unrelated to the v1 location
// verification machine in gbp-eligibility.ts, which gates publishing.
export const gbpAccessStateSchema = z.enum([
  "not_requested",
  "invited",
  "pending",
  "granted",
  "revoked",
  "blocked",
])
export type GbpAccessState = z.infer<typeof gbpAccessStateSchema>

export const gbpAccessStates = gbpAccessStateSchema.options

// The natural operator vocabulary (SEND_INVITE/MARK_PENDING/GRANT/REVOKE/BLOCK)
// walks the owner-visible progression; OVERRIDE is the audited escape hatch for
// out-of-band grants and corrections. Keeping the two apart lets the audit log
// distinguish "the flow advanced" from "an operator forced a state".
export type GbpAccessAction =
  | { readonly type: "SEND_INVITE" }
  | { readonly type: "MARK_PENDING" }
  | { readonly type: "GRANT" }
  | { readonly type: "REVOKE" }
  | { readonly type: "BLOCK"; readonly reason?: string }
  | { readonly type: "OVERRIDE"; readonly targetState: GbpAccessState }

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
