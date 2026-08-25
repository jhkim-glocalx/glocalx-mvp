import type { NextRequest } from "next/server"

import { withAdminRoute } from "@/server/route-database"

// The Users section's full directory, most recently created first.
export async function GET(request: NextRequest) {
  return withAdminRoute(request, async (context) => {
    const users = await context.userDirectoryStore.listUsers()
    return Response.json({ users })
  })
}
