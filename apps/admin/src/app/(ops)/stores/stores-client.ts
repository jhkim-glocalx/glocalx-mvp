import type { GbpAccessStoreView } from "@/server/gbp-access-view"
import type {
  GbpAccessAction,
  GbpAccessState,
} from "@glocalx/domain/gbp-access"
import type { GbpVerificationState } from "@glocalx/domain/gbp-verification-state"

// Fetch helpers for the Stores console, kept out of the component so the
// request/response shapes live in one place (mirrors queue-client.ts).

const storesUrl = "/api/stores/access-requests"

export type StoreActionResult =
  | { readonly kind: "ok"; readonly request: GbpAccessStoreView }
  | { readonly kind: "error"; readonly message: string }

function jsonInit(body: unknown): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }
}

async function readRequestResult(
  response: Response
): Promise<StoreActionResult> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return {
      kind: "error",
      message: "The server returned an unreadable response.",
    }
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "request" in payload &&
    (payload as { request: unknown }).request !== null &&
    response.ok
  ) {
    return {
      kind: "ok",
      request: (payload as { request: GbpAccessStoreView }).request,
    }
  }

  // A stale view surfaces as STATUS_CONFLICT; show the operator where it landed.
  const conflictState =
    typeof payload === "object" &&
    payload !== null &&
    "currentState" in payload &&
    typeof (payload as { currentState: unknown }).currentState === "string"
      ? (payload as { currentState: string }).currentState
      : undefined
  const message = conflictState
    ? `This store moved to "${conflictState}" — reload before acting.`
    : "That action could not be completed."
  return { kind: "error", message }
}

export async function fetchStores(): Promise<readonly GbpAccessStoreView[]> {
  const response = await fetch(storesUrl)
  if (!response.ok) {
    return []
  }
  const payload = (await response.json()) as {
    readonly stores?: readonly GbpAccessStoreView[]
  }
  return payload.stores ?? []
}

export async function applyStoreAction(
  requestId: string,
  action: GbpAccessAction
): Promise<StoreActionResult> {
  return readRequestResult(
    await fetch(`${storesUrl}/${requestId}/transition`, jsonInit(action))
  )
}

export async function saveStoreNote(
  requestId: string,
  note: string
): Promise<StoreActionResult> {
  return readRequestResult(
    await fetch(`${storesUrl}/${requestId}/note`, jsonInit({ note }))
  )
}

// The natural operator actions available from each state — the guided flow the
// buttons render. Anything not here is reachable only through the override
// selector, which is the audited out-of-band path.
export const naturalActionsByState: Readonly<
  Record<GbpAccessState, readonly { label: string; action: GbpAccessAction }[]>
> = {
  not_requested: [{ label: "Send invite", action: { type: "SEND_INVITE" } }],
  // Confirm is one click; reject is not, because its reason is sent to the owner
  // verbatim. The console renders reject separately with a required reason input
  // rather than listing it here as a bare button.
  adoption_review: [
    { label: "Confirm adoption", action: { type: "CONFIRM_ADOPTION" } },
  ],
  invited: [
    { label: "Mark pending", action: { type: "MARK_PENDING" } },
    { label: "Grant", action: { type: "GRANT" } },
  ],
  pending: [{ label: "Grant", action: { type: "GRANT" } }],
  granted: [{ label: "Revoke", action: { type: "REVOKE" } }],
  revoked: [],
  // A blocked request resumes the flow without an override. Confirm adoption is
  // offered here because a rejected claim lands in blocked and is resolved in
  // chat: once the owner clarifies, this is the operator's way back to granted
  // *with* the listing attached. Overriding to granted would skip that write and
  // leave the owner connected to nothing.
  blocked: [
    { label: "Send invite", action: { type: "SEND_INVITE" } },
    { label: "Confirm adoption", action: { type: "CONFIRM_ADOPTION" } },
    { label: "Grant", action: { type: "GRANT" } },
  ],
}

// BLOCK is offered on every active state as a distinct control, so it isn't
// listed above; the console renders it alongside the natural actions.
export const canBlock: Readonly<Record<GbpAccessState, boolean>> = {
  not_requested: true,
  adoption_review: true,
  invited: true,
  pending: true,
  granted: false,
  revoked: false,
  blocked: false,
}

export const stateLabels: Readonly<Record<GbpAccessState, string>> = {
  not_requested: "Not requested",
  adoption_review: "Owner claims existing listing",
  invited: "Invited",
  pending: "Pending",
  granted: "Granted",
  revoked: "Revoked",
  blocked: "Blocked",
}

// Listing-verification labels for the read-only line on each store card.
// NEEDS_CONCIERGE is the state the operator acts on (Model A live-assist), so the
// console highlights it; the rest are informational.
export const verificationStateLabels: Readonly<
  Record<GbpVerificationState, string>
> = {
  VERIFIED: "Verified",
  PENDING_REVIEW: "Pending review",
  NEEDS_VERIFICATION: "Needs verification",
  NEEDS_CONCIERGE: "Needs concierge",
  UNKNOWN: "Unknown",
}
