"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { QueueEntryView, QueueRequestView } from "@/server/queue-view"

import {
  fetchQueue,
  fetchQueueRequest,
  saveFinalCopy,
  startProduction,
  submitForReview,
  uploadProcessedAsset,
  type QueueActionResult,
} from "./queue-client"

const listPollMs = 5000

// Ten statuses would make ten near-empty columns, so the board groups them the
// way an operator actually works: the four actionable buckets, then everything
// the queue can't act on yet (publishing lands in a later PR).
const columns = [
  { key: "submitted", label: "Submitted", statuses: ["submitted"] },
  { key: "in_production", label: "In production", statuses: ["in_production"] },
  {
    key: "ready_for_review",
    label: "Awaiting owner",
    statuses: ["ready_for_review"],
  },
  {
    key: "changes_requested",
    label: "Changes requested",
    statuses: ["changes_requested"],
  },
  {
    key: "settled",
    label: "Settled",
    statuses: [
      "approved",
      "rejected",
      "publishing",
      "published",
      "partially_published",
      "failed",
    ],
  },
] as const

type QueueConsoleProps = {
  readonly initialRequests: readonly QueueEntryView[]
}

export function QueueConsole({ initialRequests }: QueueConsoleProps) {
  const [entries, setEntries] =
    useState<readonly QueueEntryView[]>(initialRequests)
  const [selected, setSelected] = useState<QueueRequestView | null>(null)
  const [copyInput, setCopyInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const selectedIdRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const pollList = useCallback(async () => {
    try {
      setEntries(await fetchQueue())
    } catch {
      // Best-effort; the next tick reconciles.
    }
  }, [])

  useEffect(() => {
    // The board is server-rendered on mount, so the first refresh can wait for
    // the interval tick rather than firing synchronously in the effect.
    const timer = setInterval(() => void pollList(), listPollMs)
    return () => clearInterval(timer)
  }, [pollList])

  // Every mutation returns the request's new state, so one handler applies it:
  // adopt the fresh detail, reseed the copy editor only when the server's copy
  // actually differs from what is on screen, and refresh the board.
  function applyResult(result: QueueActionResult): boolean {
    if (result.kind === "error") {
      setError(result.message)
      return false
    }
    setError(null)
    setSelected(result.request)
    selectedIdRef.current = result.request.id
    setCopyInput(result.request.finalCopy ?? "")
    void pollList()
    return true
  }

  async function openRequest(entry: QueueEntryView): Promise<void> {
    selectedIdRef.current = entry.id
    setError(null)
    setBusy(true)
    try {
      const result = await fetchQueueRequest(entry.id)
      // Drop a stale response if the operator clicked another card meanwhile.
      if (selectedIdRef.current === entry.id) {
        applyResult(result)
      }
    } finally {
      setBusy(false)
    }
  }

  async function runAction(
    action: (requestId: string) => Promise<QueueActionResult>
  ): Promise<void> {
    const requestId = selected?.id
    if (requestId === undefined || busy) {
      return
    }
    setBusy(true)
    try {
      applyResult(await action(requestId))
    } catch {
      setError("That action could not be completed. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function handleFiles(files: FileList | null): Promise<void> {
    const requestId = selected?.id
    if (requestId === undefined || files === null || files.length === 0) {
      return
    }
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        const result = await uploadProcessedAsset(requestId, file)
        if (!applyResult(result)) {
          return
        }
      }
      if (fileInputRef.current !== null) {
        fileInputRef.current.value = ""
      }
    } catch {
      setError("The upload could not be completed. Try again.")
    } finally {
      setBusy(false)
    }
  }

  const inProduction = selected?.status === "in_production"
  const claimable =
    selected?.status === "submitted" || selected?.status === "changes_requested"
  const processedAssets =
    selected?.assets.filter((asset) => asset.kind === "processed") ?? []
  const originalAssets =
    selected?.assets.filter((asset) => asset.kind === "original") ?? []

  return (
    <div className="ops-queue">
      <div className="ops-queue-board" aria-label="Campaign requests">
        {columns.map((column) => {
          const cards = entries.filter((entry) =>
            (column.statuses as readonly string[]).includes(entry.status)
          )
          return (
            <section
              key={column.key}
              className="ops-queue-column"
              data-testid={`queue-column-${column.key}`}
            >
              <header className="ops-queue-column-head">
                <span>{column.label}</span>
                <span className="ops-queue-count">{cards.length}</span>
              </header>
              {cards.length === 0 ? (
                <p className="ops-queue-empty">Nothing here.</p>
              ) : (
                cards.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="ops-queue-card"
                    aria-current={
                      entry.id === selected?.id ? "true" : undefined
                    }
                    onClick={() => void openRequest(entry)}
                  >
                    <span className="ops-queue-store">{entry.storeName}</span>
                    <span className="ops-queue-brief">{entry.brief}</span>
                    <span className="ops-queue-meta">
                      {entry.originalCount} original
                      {entry.originalCount === 1 ? "" : "s"}
                      {entry.processedCount > 0
                        ? ` · ${entry.processedCount} processed`
                        : ""}
                    </span>
                  </button>
                ))
              )}
            </section>
          )
        })}
      </div>

      {selected === null ? (
        <section className="ops-queue-detail ops-queue-detail-empty">
          <p>Select a request to view its brief, originals, and controls.</p>
        </section>
      ) : (
        <section className="ops-queue-detail" data-testid="queue-detail">
          <header className="ops-queue-detail-head">
            <div>
              <strong>{selected.storeName}</strong>
              <span className="ops-queue-status" data-testid="queue-status">
                {selected.status}
              </span>
            </div>
            {claimable ? (
              <button
                type="button"
                className="ops-primary-button"
                data-testid="start-production"
                disabled={busy}
                onClick={() => void runAction(startProduction)}
              >
                Start production
              </button>
            ) : null}
          </header>

          {error !== null ? (
            <div className="ops-queue-error" role="alert">
              {error}
            </div>
          ) : null}

          <div className="ops-queue-section">
            <h2>Brief</h2>
            <p className="ops-queue-brief-body">{selected.brief}</p>
          </div>

          <div className="ops-queue-section">
            <h2>Originals ({originalAssets.length})</h2>
            <div className="ops-queue-assets">
              {originalAssets.length === 0 ? (
                <p className="ops-queue-empty">No originals uploaded.</p>
              ) : (
                originalAssets.map((asset) =>
                  asset.signedUrl === null ? (
                    <span key={asset.id} className="ops-queue-asset-missing">
                      {asset.contentType} (unavailable)
                    </span>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element --
                       signed Blob URLs expire, so the optimizer's cache would
                       serve dead links. */
                    <img
                      key={asset.id}
                      alt="Owner-supplied original"
                      className="ops-queue-asset"
                      src={asset.signedUrl}
                    />
                  )
                )
              )}
            </div>
          </div>

          {selected.reviewEvents.length > 0 ? (
            <div className="ops-queue-section">
              <h2>Owner decisions</h2>
              <ul
                className="ops-queue-events"
                data-testid="queue-review-events"
              >
                {selected.reviewEvents.map((event) => (
                  <li key={event.id}>
                    <strong>{event.decision}</strong>
                    {event.note === null ? null : <span> — {event.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {inProduction ? (
            <>
              <div className="ops-queue-section">
                <h2>Processed assets ({processedAssets.length})</h2>
                <div className="ops-queue-assets">
                  {processedAssets.map((asset) =>
                    asset.signedUrl === null ? (
                      <span key={asset.id} className="ops-queue-asset-missing">
                        {asset.contentType} (unavailable)
                      </span>
                    ) : (
                      /* eslint-disable-next-line @next/next/no-img-element --
                         signed Blob URLs expire, so the optimizer's cache would
                         serve dead links. */
                      <img
                        key={asset.id}
                        alt="Processed material"
                        className="ops-queue-asset"
                        src={asset.signedUrl}
                      />
                    )
                  )}
                </div>
                <label className="ops-queue-upload">
                  <input
                    ref={fileInputRef}
                    accept="image/png,image/jpeg,image/webp,image/heic"
                    data-testid="processed-upload"
                    disabled={busy}
                    multiple
                    onChange={(event) => void handleFiles(event.target.files)}
                    type="file"
                  />
                  <span>Upload processed asset</span>
                </label>
              </div>

              <div className="ops-queue-section">
                <h2>Final copy</h2>
                <textarea
                  aria-label="Final copy"
                  className="ops-inbox-input"
                  data-testid="final-copy"
                  rows={4}
                  value={copyInput}
                  onChange={(event) => setCopyInput(event.target.value)}
                />
                <div className="ops-queue-actions">
                  <button
                    type="button"
                    className="ops-inbox-action"
                    data-testid="save-final-copy"
                    disabled={busy || copyInput.trim().length === 0}
                    onClick={() =>
                      void runAction((requestId) =>
                        saveFinalCopy(requestId, copyInput.trim())
                      )
                    }
                  >
                    Save copy
                  </button>
                  <button
                    type="button"
                    className="ops-primary-button"
                    data-testid="submit-for-review"
                    disabled={busy}
                    onClick={() => void runAction(submitForReview)}
                  >
                    Send to owner
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </section>
      )}
    </div>
  )
}
