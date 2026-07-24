"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { QueueEntryView, QueueRequestView } from "@/server/queue-view"

import {
  fetchQueue,
  fetchQueueRequest,
  markOwnerNudged,
  publishCampaign,
  saveFinalCopy,
  startProduction,
  submitForReview,
  uploadProcessedAsset,
  type QueueActionResult,
} from "./queue-client"

const listPollMs = 5000

// Publish attempts are capped at three per channel (architecture.md §2); the
// panel mirrors the server's cap so an exhausted channel reads as "publish it
// by hand", not as a button that will be refused.
const maxPublishAttempts = 3

const channelLabels: Readonly<Record<string, string>> = {
  gbp: "Google Business Profile",
  instagram: "Instagram",
}

// The statuses where a publish run is a legal next step: the owner's go, and
// the two settled-but-incomplete outcomes a retry can resume from.
const publishableStatuses = ["approved", "partially_published", "failed"]

// Ten statuses would make ten near-empty columns, so the board groups them the
// way an operator actually works: the actionable buckets, then the ones nobody
// has to touch again. "Publishing" holds every status a publish run can still
// act on, including the two partial outcomes a retry resumes from.
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
    key: "publishing",
    label: "Publishing",
    statuses: ["approved", "publishing", "partially_published", "failed"],
  },
  {
    key: "settled",
    label: "Settled",
    statuses: ["published", "rejected"],
  },
] as const

type QueueConsoleProps = {
  readonly initialRequests: readonly QueueEntryView[]
}

// A channel is offered when the store's gates pass, it has not already gone
// live, and it has attempts left — the same three conditions the publish route
// enforces, so the panel never offers a click the server will refuse.
function isPublishable(request: QueueRequestView, channel: string): boolean {
  const eligibility = request.channelEligibility.find(
    (entry) => entry.channel === channel
  )
  if (eligibility === undefined || !eligibility.eligible) {
    return false
  }
  const job = request.publishJobs.find((entry) => entry.channel === channel)
  if (job === undefined) {
    return true
  }
  return job.status !== "published" && job.attemptCount < maxPublishAttempts
}

// The owner is owed a personal message exactly while their material sits
// unanswered and nobody has said they sent one. Both the board card and the
// detail panel read this, so an operator scanning the board sees the same
// outstanding step the panel would tell them about.
function awaitsNudge(entry: {
  readonly status: string
  readonly nudgedAt: string | null
}): boolean {
  return entry.status === "ready_for_review" && entry.nudgedAt === null
}

function defaultPublishChannels(request: QueueRequestView): readonly string[] {
  return request.channelEligibility
    .map((entry) => entry.channel)
    .filter((channel) => isPublishable(request, channel))
}

export function QueueConsole({ initialRequests }: QueueConsoleProps) {
  const [entries, setEntries] =
    useState<readonly QueueEntryView[]>(initialRequests)
  const [selected, setSelected] = useState<QueueRequestView | null>(null)
  const [copyInput, setCopyInput] = useState("")
  const [publishChannels, setPublishChannels] = useState<readonly string[]>([])
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
    // Re-derived from the server's own view every time, so a channel that just
    // published or just burned its last attempt drops out of the selection.
    setPublishChannels(defaultPublishChannels(result.request))
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

  function toggleChannel(channel: string): void {
    setPublishChannels((current) =>
      current.includes(channel)
        ? current.filter((entry) => entry !== channel)
        : [...current, channel]
    )
  }

  const inProduction = selected?.status === "in_production"
  // The panel stays visible through "publishing"/"published" so the operator
  // keeps the per-channel history after the run, not just the controls.
  const showPublishPanel =
    selected !== null &&
    (publishableStatuses.includes(selected.status) ||
      selected.status === "publishing" ||
      selected.status === "published")
  const canPublish =
    selected !== null && publishableStatuses.includes(selected.status)
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
                    {awaitsNudge(entry) ? (
                      <span
                        className="ops-queue-nudge-pending"
                        data-testid={`nudge-pending-${entry.id}`}
                      >
                        Owner not notified yet
                      </span>
                    ) : null}
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

          {selected.status === "ready_for_review" ? (
            <div className="ops-queue-section" data-testid="nudge-panel">
              <h2>Owner nudge</h2>
              {selected.nudgedAt === null ? (
                <>
                  <p className="ops-queue-nudge-copy">
                    The app told the owner their material is ready, but nothing
                    pushes that to their phone. Message them on the channel you
                    already use, then mark it here.
                  </p>
                  <div className="ops-queue-actions">
                    <button
                      type="button"
                      className="ops-primary-button"
                      data-testid="mark-nudged"
                      disabled={busy}
                      onClick={() => void runAction(markOwnerNudged)}
                    >
                      Mark owner notified
                    </button>
                  </div>
                </>
              ) : (
                <p className="ops-queue-nudge-done" data-testid="nudge-done">
                  Owner notified {new Date(selected.nudgedAt).toLocaleString()}
                </p>
              )}
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

          {showPublishPanel ? (
            <div className="ops-queue-section" data-testid="publish-panel">
              <h2>Publish</h2>
              <ul className="ops-publish-channels">
                {selected.channelEligibility.map((eligibility) => {
                  const channel = eligibility.channel
                  const job = selected.publishJobs.find(
                    (entry) => entry.channel === channel
                  )
                  const selectable =
                    canPublish && isPublishable(selected, channel)
                  const exhausted =
                    job !== undefined &&
                    job.status === "failed" &&
                    job.attemptCount >= maxPublishAttempts
                  return (
                    <li
                      key={channel}
                      className="ops-publish-channel"
                      data-testid={`publish-channel-${channel}`}
                    >
                      <label className="ops-publish-channel-head">
                        <input
                          checked={publishChannels.includes(channel)}
                          data-testid={`publish-select-${channel}`}
                          disabled={busy || !selectable}
                          onChange={() => toggleChannel(channel)}
                          type="checkbox"
                        />
                        <span>{channelLabels[channel] ?? channel}</span>
                        <span
                          className="ops-queue-status"
                          data-testid={`publish-status-${channel}`}
                        >
                          {job?.status ?? "not attempted"}
                        </span>
                      </label>
                      <p className="ops-publish-channel-meta">
                        {job === undefined
                          ? null
                          : `Attempt ${job.attemptCount} of ${maxPublishAttempts}`}
                        {job?.externalRef === undefined ||
                        job.externalRef === null
                          ? null
                          : ` · ${job.externalRef}`}
                      </p>
                      {eligibility.message === null ? null : (
                        <p className="ops-publish-channel-blocked">
                          {eligibility.message}
                        </p>
                      )}
                      {job?.lastError === undefined ||
                      job.lastError === null ? null : (
                        <p
                          className="ops-publish-channel-error"
                          data-testid={`publish-error-${channel}`}
                        >
                          {job.lastError}
                        </p>
                      )}
                      {exhausted ? (
                        <p
                          className="ops-publish-channel-blocked"
                          data-testid={`publish-exhausted-${channel}`}
                        >
                          All {maxPublishAttempts} attempts used. Publish this
                          channel by hand and record the result.
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
              {canPublish ? (
                <div className="ops-queue-actions">
                  <button
                    type="button"
                    className="ops-primary-button"
                    data-testid="publish-selected"
                    disabled={busy || publishChannels.length === 0}
                    onClick={() =>
                      void runAction((requestId) =>
                        publishCampaign(requestId, publishChannels)
                      )
                    }
                  >
                    Publish selected
                  </button>
                </div>
              ) : null}
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
