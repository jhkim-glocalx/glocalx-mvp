import type { PostDraftEntryView } from "@/server/post-draft-view"

type PostDraftsListProps = {
  readonly drafts: readonly PostDraftEntryView[]
}

const channelLabels: Readonly<Record<string, string>> = {
  GBP: "Google Business Profile",
  INSTAGRAM: "Instagram",
}

const statusLabels: Readonly<Record<string, string>> = {
  DRAFT: "초안",
  APPROVED: "승인됨",
  PUBLISHED: "게시됨",
  FAILED: "실패",
}

const attemptStatusLabels: Readonly<Record<string, string>> = {
  REQUESTED: "요청됨",
  SUCCEEDED: "성공",
  FAILED: "실패",
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
        <strong>아직 사장님 초안이 없습니다</strong>
        <p>오너 앱의 게시물 플로우에서 만든 초안이 여기에 표시됩니다.</p>
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
            <span>{new Date(draft.createdAt).toLocaleString("ko-KR")}</span>
            {draft.attemptCount > 0 ? (
              <span>
                게시 시도 {draft.attemptCount}회 ·{" "}
                {draft.latestAttemptStatus !== null
                  ? (attemptStatusLabels[draft.latestAttemptStatus] ??
                    draft.latestAttemptStatus)
                  : "알 수 없음"}
                {publicPostHref(draft.latestAttemptPublicUrl) !== undefined ? (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href={publicPostHref(draft.latestAttemptPublicUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      게시물 보기
                    </a>
                  </>
                ) : null}
              </span>
            ) : (
              <span>게시 시도 없음</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
