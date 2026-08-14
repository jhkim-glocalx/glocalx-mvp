import type { PostDraftEntryView } from "@/server/post-draft-view"

type PostDraftsListProps = {
  readonly drafts: readonly PostDraftEntryView[]
}

const channelLabels: Readonly<Record<string, string>> = {
  GBP: "Google Business Profile",
  INSTAGRAM: "Instagram",
}

const statusLabels: Readonly<Record<string, string>> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  FAILED: "Failed",
}

const attemptStatusLabels: Readonly<Record<string, string>> = {
  REQUESTED: "Requested",
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
}

// The published post's address, or undefined when there is nothing safe to
// open. Mirrors queue-console.tsx's publishedPostHref: the value round-trips
// through Google/Instagram before landing here, so the scheme is checked
// rather than assumed before it becomes an href.
function publicPostHref(publicUrl: string | null): string | undefined {
  return publicUrl !== null && publicUrl.startsWith("https://")
    ? publicUrl
    : undefined
}

export function PostDraftsList({ drafts }: PostDraftsListProps) {
  if (drafts.length === 0) {
    return (
      <div className="ops-empty">
        <strong>No owner drafts yet</strong>
        <p>Drafts created from the owner app&apos;s Posts flow appear here.</p>
      </div>
    )
  }

  return (
    <ul className="ops-posts-list">
      {drafts.map((draft) => (
        <li key={draft.id} className="ops-posts-item">
          <div className="ops-posts-item-head">
            <span className="ops-posts-store">{draft.storeName}</span>
            <span className="ops-posts-badge">
              {channelLabels[draft.targetChannel] ?? draft.targetChannel}
            </span>
            <span className="ops-posts-badge">
              {statusLabels[draft.status] ?? draft.status}
            </span>
          </div>
          <p className="ops-posts-intent">{draft.ownerIntent}</p>
          <p className="ops-posts-copy">{draft.koreanCopy}</p>
          <div className="ops-posts-meta">
            <span>{new Date(draft.createdAt).toLocaleString()}</span>
            {draft.attemptCount > 0 ? (
              <span>
                {draft.attemptCount} publish attempt
                {draft.attemptCount === 1 ? "" : "s"} ·{" "}
                {draft.latestAttemptStatus !== null
                  ? (attemptStatusLabels[draft.latestAttemptStatus] ??
                    draft.latestAttemptStatus)
                  : "unknown"}
                {publicPostHref(draft.latestAttemptPublicUrl) !== undefined ? (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href={publicPostHref(draft.latestAttemptPublicUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View post
                    </a>
                  </>
                ) : null}
              </span>
            ) : (
              <span>No publish attempts</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
