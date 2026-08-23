import type { NextRequest } from "next/server"

import { withAdminRoute } from "@/server/route-database"
import { listOrgLocations } from "@glocalx/integrations/gbp-org-locations"

// The org account's own Google listings, for the adoption picker.
//
// Operator-only by construction: this is the full set of listings the org
// manages, which is every customer's business. It is safe here — an operator is
// already trusted with the whole Stores console — and is exactly what must never
// be returned from the owner-facing adoption route, which answers with a single
// server-side match and no listing details.
export async function GET(request: NextRequest) {
  return withAdminRoute(request, async (context) => {
    const listed = await listOrgLocations({
      adapters: context.adapters,
      env: process.env,
      fetchImpl: fetch,
    })

    if (listed.kind === "blocked_by_credentials") {
      return Response.json(
        {
          status: "BLOCKED_BY_CREDENTIALS",
          missingEnvVars: listed.missingEnvVars,
        },
        { status: 503 }
      )
    }
    if (listed.kind === "upstream_error") {
      return Response.json(
        { status: "UPSTREAM_ERROR", message: listed.message },
        { status: 502 }
      )
    }

    return Response.json({ status: "OK", locations: listed.locations })
  })
}
