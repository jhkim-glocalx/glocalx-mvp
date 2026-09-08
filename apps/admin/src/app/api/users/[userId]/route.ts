import type { NextRequest } from "next/server"

import { notFoundResponse, withAdminRoute } from "@/server/route-database"

type RouteContext = {
  readonly params: Promise<{ readonly userId: string }>
}

// Hard delete, the counterpart to POST .../deactivate: the account and
// everything it owns are erased, which frees the email for a fresh sign-up.
// Deactivation cannot do that — its row keeps the UNIQUE(email) slot — so an
// account that has to be handed back to the owner needs this path. 404 when the
// user is already gone, so a double-click reads as "nothing to do".
export async function DELETE(request: NextRequest, routeContext: RouteContext) {
  const { userId } = await routeContext.params

  return withAdminRoute(
    request,
    async (context) => {
      const deleted = await context.userDirectoryStore.deleteUser(userId)
      if (deleted === undefined) {
        return notFoundResponse()
      }

      // Recorded after the delete: the account's own audit rows are erased with
      // it, so this row is the only surviving record of the erasure.
      await context.auditLogStore.record({
        action: "user_delete",
        adminUserId: context.adminUserId,
        detail: { userId },
      })

      return Response.json({ status: "OK", user: deleted })
    },
    { requireSameOrigin: true }
  )
}
