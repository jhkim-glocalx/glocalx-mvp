import { requireAdminSession } from "@/auth/server-session"
import { toInboxConversationView } from "@/server/inbox-view"
import { openDatabaseContext } from "@glocalx/db"
import { createDatabaseCsConversationStore } from "@glocalx/db/support/conversation-store"

import { InboxConsole } from "./inbox-console"

// Server-render the first list so the console has data on paint; the client
// takes over polling from there.
export default async function InboxPage() {
  const session = await requireAdminSession()

  const databaseContext = await openDatabaseContext()
  let initialConversations
  try {
    const summaries = await createDatabaseCsConversationStore(
      databaseContext.queryable
    ).listInboxConversations({ status: "open" })
    initialConversations = summaries.map(toInboxConversationView)
  } finally {
    await databaseContext.close()
  }

  return (
    <>
      <h1 className="ops-page-title">Inbox</h1>
      <InboxConsole
        operatorAdminId={session.adminUserId}
        initialConversations={initialConversations}
      />
    </>
  )
}
