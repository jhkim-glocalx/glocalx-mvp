"use client"

import { useState } from "react"

import type { GbpAccessStoreView } from "@/server/gbp-access-view"
import type { StoreVerificationView } from "@/server/gbp-verification-view"
import {
  gbpAccessStates,
  type GbpAccessState,
} from "@glocalx/domain/gbp-access"

import {
  applyStoreAction,
  canBlock,
  fetchStores,
  naturalActionsByState,
  saveStoreNote,
  stateLabels,
  verificationStateLabels,
  type StoreActionResult,
} from "./stores-client"

function formatAge(updatedAt: string): string {
  const elapsedMs = Date.now() - Date.parse(updatedAt)
  if (Number.isNaN(elapsedMs) || elapsedMs < 60_000) {
    return "just now"
  }
  const minutes = Math.floor(elapsedMs / 60_000)
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h`
  }
  return `${Math.floor(hours / 24)}d`
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
        <h1 className="ops-page-title">Stores</h1>
        <div className="ops-empty">
          <strong>No stores yet</strong>
          <p>
            Stores appear here once an owner completes GBP connect. Drive the
            org manager-access grant from each card.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <h1 className="ops-page-title">Stores</h1>
      {conciergeCount === 0 ? null : (
        <p className="ops-stores-concierge" data-testid="stores-concierge-count">
          {conciergeCount} store{conciergeCount === 1 ? " needs" : "s need"}{" "}
          concierge verification — call the owner and walk them through
          Google&rsquo;s video verification.
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
  store,
  verification,
  onAction,
}: {
  readonly busy: boolean
  readonly store: GbpAccessStoreView
  readonly verification: StoreVerificationView | null
  readonly onAction: (work: () => Promise<StoreActionResult>) => void
}) {
  const [overrideTarget, setOverrideTarget] = useState<GbpAccessState | "">("")
  const [noteDraft, setNoteDraft] = useState(store.note ?? "")

  const naturalActions = naturalActionsByState[store.state]
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
          {formatAge(store.updatedAt)} in state
        </span>
      </div>

      {store.gbpLocationRef === null ? null : (
        <p className="ops-store-meta">Location: {store.gbpLocationRef}</p>
      )}
      {verification === null ? null : (
        <p
          className={`ops-store-verification ops-store-verification-${verification.state}`}
          data-testid={`store-verification-${store.storeId}`}
        >
          Listing: {verificationStateLabels[verification.state]}
        </p>
      )}
      {store.note === null ? null : (
        <p className="ops-store-note">Note: {store.note}</p>
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
            Block
          </button>
        ) : null}
      </div>

      <div className="ops-store-override">
        <label className="ops-store-override-label">
          Override
          <select
            data-testid={`store-override-${store.storeId}`}
            disabled={busy}
            onChange={(event) =>
              setOverrideTarget(event.target.value as GbpAccessState | "")
            }
            value={overrideTarget}
          >
            <option value="">Select state…</option>
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
          Apply override
        </button>
      </div>

      <div className="ops-store-note-edit">
        <input
          className="ops-store-note-input"
          data-testid={`store-note-${store.storeId}`}
          disabled={busy}
          onChange={(event) => setNoteDraft(event.target.value)}
          placeholder="Chase note"
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
          Save note
        </button>
      </div>
    </li>
  )
}
