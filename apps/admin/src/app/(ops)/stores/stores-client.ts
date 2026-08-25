import type { GbpAccessStoreView } from "@/server/gbp-access-view"
import type {
  GbpAccessAction,
  GbpAccessState,
} from "@glocalx/domain/gbp-access"
import type { GbpVerificationState } from "@glocalx/domain/gbp-verification-state"
import type { PendingGbpSetupStore } from "@glocalx/db/support/gbp-access-store"

// Fetch helpers for the Stores console, kept out of the component so the
// request/response shapes live in one place (mirrors queue-client.ts).

const storesUrl = "/api/stores/access-requests"
const orgLocationsUrl = "/api/stores/org-locations"
const pendingSetupUrl = "/api/stores/pending-setup"

export async function fetchPendingSetupStores(): Promise<
  readonly PendingGbpSetupStore[]
> {
  const response = await fetch(pendingSetupUrl)
  if (!response.ok) {
    return []
  }
  const payload = (await response.json()) as {
    readonly stores?: readonly PendingGbpSetupStore[]
  }
  return payload.stores ?? []
}

export type RunSetupResult =
  | { readonly kind: "ok" }
  | { readonly kind: "error"; readonly message: string }

// Runs the same concierge RUN_SETUP action the Stores console already offers
// per-store once a request exists — this is what lets a *pre*-request store
// (confirmed, never submitted) reach Google for the first time.
export async function runGbpSetup(storeId: string): Promise<RunSetupResult> {
  const response = await fetch(`/api/stores/${storeId}/gbp/setup/actions`, {
    body: JSON.stringify({ type: "RUN_SETUP" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  if (!response.ok) {
    return { kind: "error", message: "GBP 등록을 실행하지 못했습니다." }
  }
  return { kind: "ok" }
}

export type OrgLocationOption = {
  readonly name: string
  readonly title: string
  readonly addressLine: string
}

export type OrgLocationsResult =
  | { readonly kind: "ok"; readonly locations: readonly OrgLocationOption[] }
  | { readonly kind: "error"; readonly message: string }

/**
 * The org account's listings, for the adoption picker.
 *
 * Failure is returned rather than thrown: the picker is an aid, and losing it
 * must not take the rest of the console's actions down with it.
 */
export async function fetchOrgLocations(): Promise<OrgLocationsResult> {
  let payload: unknown
  try {
    payload = await (await fetch(orgLocationsUrl)).json()
  } catch {
    return { kind: "error", message: "조직 리스팅을 불러오지 못했습니다." }
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("locations" in payload) ||
    !Array.isArray(payload.locations)
  ) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : "조직 리스팅을 불러오지 못했습니다."
    return { kind: "error", message }
  }

  return {
    kind: "ok",
    locations: payload.locations as readonly OrgLocationOption[],
  }
}

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
      message: "서버가 해석할 수 없는 응답을 반환했습니다.",
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
    ? `이 매장은 "${stateLabels[conflictState as GbpAccessState] ?? conflictState}" 상태로 변경되었습니다 — 새로고침 후 다시 시도해 주세요.`
    : "해당 작업을 완료할 수 없습니다."
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
  not_requested: [{ label: "초대 보내기", action: { type: "SEND_INVITE" } }],
  // Confirm is one click; reject is not, because its reason is sent to the owner
  // verbatim. The console renders reject separately with a required reason input
  // rather than listing it here as a bare button.
  adoption_review: [
    { label: "연결 확정", action: { type: "CONFIRM_ADOPTION" } },
  ],
  invited: [
    { label: "대기 중으로 표시", action: { type: "MARK_PENDING" } },
    { label: "권한 부여", action: { type: "GRANT" } },
  ],
  pending: [{ label: "권한 부여", action: { type: "GRANT" } }],
  granted: [{ label: "권한 철회", action: { type: "REVOKE" } }],
  revoked: [],
  // A blocked request resumes the flow without an override. Confirm adoption is
  // offered here because a rejected claim lands in blocked and is resolved in
  // chat: once the owner clarifies, this is the operator's way back to granted
  // *with* the listing attached. Overriding to granted would skip that write and
  // leave the owner connected to nothing.
  blocked: [
    { label: "초대 보내기", action: { type: "SEND_INVITE" } },
    { label: "연결 확정", action: { type: "CONFIRM_ADOPTION" } },
    { label: "권한 부여", action: { type: "GRANT" } },
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
  not_requested: "요청 없음",
  adoption_review: "사장님이 기존 리스팅 연결 요청",
  invited: "초대됨",
  pending: "대기 중",
  granted: "권한 부여됨",
  revoked: "권한 철회됨",
  blocked: "차단됨",
}

// Listing-verification labels for the read-only line on each store card.
// NEEDS_CONCIERGE is the state the operator acts on (Model A live-assist), so the
// console highlights it; the rest are informational.
export const verificationStateLabels: Readonly<
  Record<GbpVerificationState, string>
> = {
  VERIFIED: "인증됨",
  PENDING_REVIEW: "검토 대기 중",
  NEEDS_VERIFICATION: "인증 필요",
  NEEDS_CONCIERGE: "컨시어지 필요",
  UNKNOWN: "알 수 없음",
}
