import type { NextRequest } from "next/server"

import { gbpAccessNoteRequestSchema } from "@glocalx/domain/gbp-access"
import { toGbpAccessStoreView } from "@/server/gbp-access-view"
import {
  notFoundResponse,
  parseAdminJson,
  withAdminRoute,
} from "@/server/route-database"

type RouteContext = {
  readonly params: Promise<{ readonly requestId: string }>
}

// A chase-note edit that annotates without advancing the flow. The store leaves
// updated_at untouched so the note doesn't reset the request's staleness age.
export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { requestId } = await routeContext.params
  const parsed = await parseAdminJson(request, gbpAccessNoteRequestSchema)
  if (parsed.kind === "response") {
    return parsed.response
  }

  return withAdminRoute(
    request,
    async (context) => {
      const updated = await context.gbpAccessStore.setGbpAccessNote({
        requestId,
        note: parsed.value.note,
        now: new Date(),
      })
      if (updated === undefined) {
        return notFoundResponse()
      }

      await context.auditLogStore.record({
        action: "gbp_access_note",
        adminUserId: context.adminUserId,
        storeId: updated.storeId,
        detail: { requestId },
      })

      const entry =
        await context.gbpAccessStore.getGbpAccessListEntryById(requestId)
      return Response.json({
        status: "OK",
        request: entry === undefined ? null : toGbpAccessStoreView(entry),
      })
    },
    { requireSameOrigin: true }
  )
}
