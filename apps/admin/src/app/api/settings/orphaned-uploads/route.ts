import type { NextRequest } from "next/server"

import { withAdminRoute } from "@/server/route-database"
import { findOrphanedUploads } from "@glocalx/domain/support/orphaned-uploads"

// Dry-run only (TODOS.md #4): lists Blob objects nothing in campaign_assets
// references, without deleting anything. An operator reads the list here
// before deletion ever gets wired up — see the design note in TODOS.md for
// why this ships as a manual preview first, not a cron.
const minOrphanAgeMs = 24 * 60 * 60 * 1000

export async function GET(request: NextRequest) {
  return withAdminRoute(request, async (context) => {
    const [blobAssets, registeredBlobUrls] = await Promise.all([
      context.adapters.mediaStore.listAssets(),
      context.campaignStore.listAllAssetBlobUrls(),
    ])

    if (blobAssets.kind === "blocked_by_credentials") {
      return Response.json(
        {
          status: "BLOCKED_BY_CREDENTIALS",
          missingEnvVars: blobAssets.missingEnvVars,
        },
        { status: 503 }
      )
    }

    const candidates = findOrphanedUploads({
      blobAssets: blobAssets.value,
      registeredBlobUrls,
      now: new Date(),
      minAgeMs: minOrphanAgeMs,
    })

    return Response.json({
      status: "OK",
      dryRun: true,
      candidates,
      totalBytes: candidates.reduce((sum, asset) => sum + asset.sizeBytes, 0),
    })
  })
}
