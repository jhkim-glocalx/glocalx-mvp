import { requireAdminSession } from "@/auth/server-session"
import { toGbpAccessStoreView } from "@/server/gbp-access-view"
import { toStoreVerificationView } from "@/server/gbp-verification-view"
import { openDatabaseContext } from "@glocalx/db"
import { createDatabaseGbpAccessStore } from "@glocalx/db/support/gbp-access-store"
import { createDatabaseGbpVerificationStore } from "@glocalx/db/support/gbp-verification-store"

import { StoresConsole } from "./stores-console"

// Server-render the first list so the console has data on paint; the client
// takes over from there (same shape as the queue page). Verification state is
// read-only here — the owner app's on-view route keeps the table fresh, so the
// operator sees the latest persisted verdict without N live Google calls on load.
export default async function StoresPage() {
  await requireAdminSession()

  const databaseContext = await openDatabaseContext()
  let initialStores
  let initialVerifications
  let initialPendingSetupStores
  try {
    const gbpAccessStore = createDatabaseGbpAccessStore(
      databaseContext.queryable
    )
    const entries = await gbpAccessStore.listGbpAccessRequests()
    initialStores = entries.map(toGbpAccessStoreView)
    const verifications = await createDatabaseGbpVerificationStore(
      databaseContext.queryable
    ).listVerificationStates()
    initialVerifications = verifications.map(toStoreVerificationView)
    initialPendingSetupStores = await gbpAccessStore.listStoresPendingGbpSetup()
  } finally {
    await databaseContext.close()
  }

  return (
    <StoresConsole
      initialPendingSetupStores={initialPendingSetupStores}
      initialStores={initialStores}
      initialVerifications={initialVerifications}
    />
  )
}
