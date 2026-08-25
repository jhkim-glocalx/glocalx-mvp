import type { NextRequest } from "next/server"

import { notFoundResponse, withAdminRoute } from "@/server/route-database"

type RouteContext = {
  readonly params: Promise<{ readonly userId: string }>
}

// Soft delete: marks the account deactivated and drops every session it
// holds. Idempotent-safe — deactivating an already-deactivated (or missing)
// user returns 404 rather than silently no-opping, so the console can tell
// the operator the click did nothing.
export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { userId } = await routeContext.params

  return withAdminRoute(
    request,
    async (context) => {
      const deactivated = await context.userDirectoryStore.deactivateUser(
        userId,
        new Date()
      )
      if (deactivated === undefined) {
        return notFoundResponse()
      }

      await context.auditLogStore.record({
        action: "user_deactivate",
        adminUserId: context.adminUserId,
        detail: { userId },
      })

      return Response.json({ status: "OK", user: deactivated })
    },
    { requireSameOrigin: true }
  )
}
