import { requireAdminSession } from "@/auth/server-session"
import { toQueueEntryView } from "@/server/queue-view"
import { openDatabaseContext } from "@glocalx/db"
import { createDatabaseCampaignStore } from "@glocalx/db/support/campaign-store"

import { QueueConsole } from "./queue-console"

// Server-render the first board so the console has data on paint; the client
// takes over polling from there (same shape as the inbox page).
export default async function QueuePage() {
  await requireAdminSession()

  const databaseContext = await openDatabaseContext()
  let initialRequests
  try {
    const entries = await createDatabaseCampaignStore(
      databaseContext.queryable
    ).listCampaignQueue()
    initialRequests = entries.map(toQueueEntryView)
  } finally {
    await databaseContext.close()
  }

  return (
    <>
      <h1 className="ops-page-title">Queue</h1>
      <QueueConsole initialRequests={initialRequests} />
    </>
  )
}
