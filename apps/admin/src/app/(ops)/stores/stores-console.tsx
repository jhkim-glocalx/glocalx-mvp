"use client"

import { useEffect, useState } from "react"

import type { GbpAccessStoreView } from "@/server/gbp-access-view"
import type { StoreVerificationView } from "@/server/gbp-verification-view"
import {
  gbpAccessStates,
  type GbpAccessState,
} from "@glocalx/domain/gbp-access"

import {
  applyStoreAction,
  canBlock,
  fetchOrgLocations,
  fetchStores,
  naturalActionsByState,
  saveStoreNote,
  stateLabels,
  verificationStateLabels,
  type OrgLocationOption,
  type StoreActionResult,
} from "./stores-client"

function formatAge(updatedAt: string): string {
  const elapsedMs = Date.now() - Date.parse(updatedAt)
  if (Number.isNaN(elapsedMs) || elapsedMs < 60_000) {
    return "방금 상태 변경"
  }
  const minutes = Math.floor(elapsedMs / 60_000)
  if (minutes < 60) {
    return `이 상태 ${minutes}분째`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `이 상태 ${hours}시간째`
  }
  return `이 상태 ${Math.floor(hours / 24)}일째`
}

function upsert(
  stores: readonly GbpAccessStoreView[],
  next: GbpAccessStoreView
): GbpAccessStoreView[] {
  return stores.map((store) =>
    store.requestId === next.requestId ? next : store
  )
}

export function StoresConsole({
  initialStores,
  initialVerifications,
}: {
  readonly initialStores: readonly GbpAccessStoreView[]
  readonly initialVerifications: readonly StoreVerificationView[]
}) {
  const [stores, setStores] =
    useState<readonly GbpAccessStoreView[]>(initialStores)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [orgLocations, setOrgLocations] = useState<
    readonly OrgLocationOption[]
  >([])
  // null = not fetched yet (or nothing needs it); a string is why the fetch
  // failed. Kept separate from an empty orgLocations array so "Google returned
  // zero listings" never reads as "the request failed" or vice versa.
  const [orgLocationsError, setOrgLocationsError] = useState<string | null>(
    null
  )

  // Fetched once for the whole console rather than per card: it is the same org
  // listing set for every store, and it calls Google in production.
  const needsOrgLocations = stores.some((store) =>
    naturalActionsByState[store.state].some(
      (entry) => entry.action.type === "CONFIRM_ADOPTION"
    )
  )

  useEffect(() => {
    if (!needsOrgLocations) {
      return
    }
    let active = true
    void fetchOrgLocations().then((result) => {
      if (!active) {
        return
      }
      if (result.kind === "ok") {
        setOrgLocations(result.locations)
        setOrgLocationsError(null)
      } else {
        setOrgLocationsError(result.message)
      }
    })
    return () => {
      active = false
    }
  }, [needsOrgLocations])

  // Verification is read-only here (no transitions), so it needs no state — just
  // a lookup by storeId for the line each card renders.
  const verificationByStoreId = new Map(
    initialVerifications.map((entry) => [entry.storeId, entry])
  )
  // Count concierge cases among the stores actually rendered, so the banner never
  // claims more than the visible cards (a verification row with no matching store
  // card would otherwise inflate it).
  const conciergeCount = stores.filter(
    (store) =>
      verificationByStoreId.get(store.storeId)?.state === "NEEDS_CONCIERGE"
  ).length

  async function run(
    requestId: string,
    work: () => Promise<StoreActionResult>
  ): Promise<void> {
    setPendingId(requestId)
    setError(null)
    const result = await work()
    if (result.kind === "ok") {
      setStores((current) => upsert(current, result.request))
    } else {
      setError(result.message)
      // Resync after a conflict so the operator sees where the store landed.
      setStores(await fetchStores())
    }
    setPendingId(null)
  }

  if (stores.length === 0) {
    return (
      <>
        <h1 className="ops-page-title">매장</h1>
        <div className="ops-empty">
          <strong>아직 매장이 없습니다</strong>
          <p>
            사장님이 GBP 연결을 완료하면 여기에 매장이 표시됩니다. 각 카드에서
            조직 관리자 권한 부여를 진행하세요.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <h1 className="ops-page-title">매장</h1>
      {conciergeCount === 0 ? null : (
        <p
          className="ops-stores-concierge"
          data-testid="stores-concierge-count"
        >
          매장 {conciergeCount}곳이 컨시어지 인증이 필요합니다 — 사장님께 전화해
          Google 동영상 인증을 안내해 주세요.
        </p>
      )}
      {error === null ? null : (
        <p className="ops-stores-error" role="alert">
          {error}
        </p>
      )}
      <ul className="ops-stores" data-testid="ops-stores">
        {stores.map((store) => (
          <StoreCard
            key={store.requestId}
            busy={pendingId === store.requestId}
            orgLocations={orgLocations}
            orgLocationsError={orgLocationsError}
            store={store}
            verification={verificationByStoreId.get(store.storeId) ?? null}
            onAction={(work) => run(store.requestId, work)}
          />
        ))}
      </ul>
    </>
  )
}

function StoreCard({
  busy,
  orgLocations,
  orgLocationsError,
  store,
  verification,
  onAction,
}: {
  readonly busy: boolean
  readonly orgLocations: readonly OrgLocationOption[]
  readonly orgLocationsError: string | null
  readonly store: GbpAccessStoreView
  readonly verification: StoreVerificationView | null
  readonly onAction: (work: () => Promise<StoreActionResult>) => void
}) {
  const [overrideTarget, setOverrideTarget] = useState<GbpAccessState | "">("")
  const [noteDraft, setNoteDraft] = useState(store.note ?? "")
  const [rejectReason, setRejectReason] = useState("")
  // Seeded from the matcher's guess, which is a starting point rather than a
  // verdict — the operator built these listings and outranks it.
  const [locationChoice, setLocationChoice] = useState(
    store.gbpLocationRef ?? ""
  )

  const allNaturalActions = naturalActionsByState[store.state]
  // Confirm is rendered inside the adoption block so it sits with the picker
  // whose value it submits, rather than as a bare button above it.
  const naturalActions = allNaturalActions.filter(
    (entry) => entry.action.type !== "CONFIRM_ADOPTION"
  )
  const canConfirmAdoption = allNaturalActions.some(
    (entry) => entry.action.type === "CONFIRM_ADOPTION"
  )
  const overrideOptions = gbpAccessStates.filter(
    (state) => state !== store.state
  )

  return (
    <li className="ops-store-card" data-testid={`store-card-${store.storeId}`}>
      <div className="ops-store-head">
        <span className="ops-store-name">{store.storeName}</span>
        <span
          className={`ops-store-state ops-store-state-${store.state}`}
          data-testid={`store-state-${store.storeId}`}
        >
          {stateLabels[store.state]}
        </span>
        <span className="ops-store-age" suppressHydrationWarning>
          {formatAge(store.updatedAt)}
        </span>
      </div>

      {store.gbpLocationRef === null ? null : (
        <p className="ops-store-meta">위치: {store.gbpLocationRef}</p>
      )}
      {verification === null ? null : (
        <p
          className={`ops-store-verification ops-store-verification-${verification.state}`}
          data-testid={`store-verification-${store.storeId}`}
        >
          리스팅: {verificationStateLabels[verification.state]}
        </p>
      )}
      {store.note === null ? null : (
        <p className="ops-store-note">메모: {store.note}</p>
      )}

      <div className="ops-store-actions">
        {naturalActions.map(({ label, action }) => (
          <button
            key={action.type}
            className="ops-store-btn"
            data-testid={`store-action-${action.type}-${store.storeId}`}
            disabled={busy}
            onClick={() =>
              onAction(() => applyStoreAction(store.requestId, action))
            }
            type="button"
          >
            {label}
          </button>
        ))}
        {canConfirmAdoption ? (
          <div className="ops-store-adopt">
            {/* The owner is told nothing about which listing matched, so this is
                the only place the decision is made — and the matcher only ever
                guesses. An operator who recognizes the store picks it here. */}
            <label className="ops-store-adopt-label">
              조직 계정의 어떤 리스팅에 연결할까요?
              <select
                data-testid={`store-adopt-location-${store.storeId}`}
                disabled={busy || orgLocations.length === 0}
                onChange={(event) => setLocationChoice(event.target.value)}
                value={locationChoice}
              >
                <option value="">리스팅 선택…</option>
                {orgLocations.map((location) => (
                  <option key={location.name} value={location.name}>
                    {location.title} — {location.addressLine}
                  </option>
                ))}
              </select>
            </label>
            {orgLocationsError !== null ? (
              <p className="ops-store-meta" role="alert">
                조직 리스팅을 사용할 수 없음 — {orgLocationsError}
              </p>
            ) : orgLocations.length === 0 ? (
              <p className="ops-store-meta">조직 리스팅을 찾을 수 없습니다.</p>
            ) : null}
            <button
              className="ops-store-btn"
              data-testid={`store-action-CONFIRM_ADOPTION-${store.storeId}`}
              disabled={busy || locationChoice.trim() === ""}
              onClick={() =>
                onAction(() =>
                  applyStoreAction(store.requestId, {
                    type: "CONFIRM_ADOPTION",
                    gbpLocationRef: locationChoice.trim(),
                  })
                )
              }
              type="button"
            >
              연결 확정
            </button>
          </div>
        ) : null}
        {store.state === "adoption_review" ? (
          <div className="ops-store-reject">
            {/* The reason is sent to the owner word for word, so it is written
                here as a message to them — not as an internal status code. */}
            <label className="ops-store-reject-label">
              거절 — 사장님께 어떻게 안내할까요?
              <input
                data-testid={`store-reject-reason-${store.storeId}`}
                disabled={busy}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="예: 저희 계정에서 찾지 못했어요. 지도에 등록된 상호를 알려주시겠어요?"
                type="text"
                value={rejectReason}
              />
            </label>
            <button
              className="ops-store-btn"
              data-testid={`store-action-REJECT_ADOPTION-${store.storeId}`}
              disabled={busy || rejectReason.trim() === ""}
              onClick={() =>
                onAction(() =>
                  applyStoreAction(store.requestId, {
                    type: "REJECT_ADOPTION",
                    reason: rejectReason.trim(),
                  })
                )
              }
              type="button"
            >
              연결 거절
            </button>
          </div>
        ) : null}
        {canBlock[store.state] ? (
          <button
            className="ops-store-btn"
            data-testid={`store-action-BLOCK-${store.storeId}`}
            disabled={busy}
            onClick={() =>
              onAction(() =>
                applyStoreAction(store.requestId, { type: "BLOCK" })
              )
            }
            type="button"
          >
            차단
          </button>
        ) : null}
      </div>

      <div className="ops-store-override">
        <label className="ops-store-override-label">
          수동 변경
          <select
            data-testid={`store-override-${store.storeId}`}
            disabled={busy}
            onChange={(event) =>
              setOverrideTarget(event.target.value as GbpAccessState | "")
            }
            value={overrideTarget}
          >
            <option value="">상태 선택…</option>
            {overrideOptions.map((state) => (
              <option key={state} value={state}>
                {stateLabels[state]}
              </option>
            ))}
          </select>
        </label>
        <button
          className="ops-store-btn"
          data-testid={`store-override-apply-${store.storeId}`}
          disabled={busy || overrideTarget === ""}
          onClick={() => {
            if (overrideTarget === "") {
              return
            }
            const targetState = overrideTarget
            setOverrideTarget("")
            onAction(() =>
              applyStoreAction(store.requestId, {
                type: "OVERRIDE",
                targetState,
              })
            )
          }}
          type="button"
        >
          수동 변경 적용
        </button>
      </div>

      <div className="ops-store-note-edit">
        <input
          className="ops-store-note-input"
          data-testid={`store-note-${store.storeId}`}
          disabled={busy}
          onChange={(event) => setNoteDraft(event.target.value)}
          placeholder="후속 조치 메모"
          value={noteDraft}
        />
        <button
          className="ops-store-btn"
          data-testid={`store-note-save-${store.storeId}`}
          disabled={busy || noteDraft.trim().length === 0}
          onClick={() =>
            onAction(() => saveStoreNote(store.requestId, noteDraft.trim()))
          }
          type="button"
        >
          메모 저장
        </button>
      </div>
    </li>
  )
}
