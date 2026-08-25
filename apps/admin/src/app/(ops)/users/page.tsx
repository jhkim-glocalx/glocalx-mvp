import { requireAdminSession } from "@/auth/server-session"
import { openDatabaseContext } from "@glocalx/db"
import { createDatabaseUserDirectoryStore } from "@glocalx/db/support/user-directory-store"

import { UsersConsole } from "./users-console"

export default async function UsersPage() {
  await requireAdminSession()

  const databaseContext = await openDatabaseContext()
  let initialUsers
  try {
    initialUsers = await createDatabaseUserDirectoryStore(
      databaseContext.queryable
    ).listUsers()
  } finally {
    await databaseContext.close()
  }

  return <UsersConsole initialUsers={initialUsers} />
}
