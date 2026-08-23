import { requireAdminSession } from "@/auth/server-session"
import { toPostDraftEntryView } from "@/server/post-draft-view"
import { openDatabaseContext } from "@glocalx/db"
import { createDatabasePostDraftStore } from "@glocalx/db/support/post-draft-store"

import { PostDraftsList } from "./post-drafts-list"

// Read-only visibility into owner self-serve drafts (apps/owner-app's Posts
// flow). Direct publish from that flow is paused — the Campaigns queue is the
// only publish path — so this page has no actions, only a list.
export default async function PostsPage() {
  await requireAdminSession()

  const databaseContext = await openDatabaseContext()
  let drafts
  try {
    const entries = await createDatabasePostDraftStore(
      databaseContext.queryable
    ).listPostDraftsForOperator()
    drafts = entries.map(toPostDraftEntryView)
  } finally {
    await databaseContext.close()
  }

  return (
    <>
      <h1 className="ops-page-title">Posts</h1>
      <PostDraftsList drafts={drafts} />
    </>
  )
}
