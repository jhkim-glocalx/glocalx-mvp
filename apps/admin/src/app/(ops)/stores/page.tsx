import { requireAdminSession } from "@/auth/server-session"
import { toGbpAccessStoreView } from "@/server/gbp-access-view"
import { openDatabaseContext } from "@glocalx/db"
import { createDatabaseGbpAccessStore } from "@glocalx/db/support/gbp-access-store"

import { StoresConsole } from "./stores-console"

// Server-render the first list so the console has data on paint; the client
// takes over from there (same shape as the queue page).
export default async function StoresPage() {
  await requireAdminSession()

  const databaseContext = await openDatabaseContext()
  let initialStores
  try {
    const entries = await createDatabaseGbpAccessStore(
      databaseContext.queryable
    ).listGbpAccessRequests()
    initialStores = entries.map(toGbpAccessStoreView)
  } finally {
    await databaseContext.close()
  }

  return <StoresConsole initialStores={initialStores} />
}
