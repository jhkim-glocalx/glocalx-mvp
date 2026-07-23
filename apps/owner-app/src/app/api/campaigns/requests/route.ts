import { randomUUID } from "node:crypto"

import type { NextRequest } from "next/server"

import { createCampaignRequestSchema } from "@glocalx/domain/campaign-contracts"
import {
  parseJsonRoutePayload,
  rateLimitedResponse,
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

// Per-store submit throttle, reusing the v1 auth-rate-limit table (same
// pattern as cs_message send in chat/messages/route.ts).
const campaignRequestMaxPerMinute = 10
const campaignRequestWindowSeconds = 60

function campaignRequestRateLimitRules(storeId: string) {
  return [
    {
      id: `campaign_request:${storeId}`,
      maximumAttempts: campaignRequestMaxPerMinute,
      windowSeconds: campaignRequestWindowSeconds,
    },
  ]
}

export async function GET(request: NextRequest) {
  return withQueryableRouteDatabase(async (context) => {
    const session = await readDatabaseSession(request, context.sessionStore)
    if (session === undefined) {
      return requiredSessionResponse()
    }

    const [requests, publishJobs] = await Promise.all([
      context.campaignStore.listCampaignRequestsForStore(session.storeId),
      // One store-wide read, grouped below — the alternative is a query per
      // request just to badge each row with its channel outcomes.
      context.publishJobStore.listPublishJobsForStore(session.storeId),
    ])

    return Response.json({
      requests: requests.map((summary) => ({
        ...summary,
        publishJobs: publishJobs
          .filter((job) => job.requestId === summary.id)
          .map((job) => ({
            channel: job.channel,
            status: job.status,
            updatedAt: job.updatedAt,
          })),
      })),
    })
  })
}

export async function POST(request: NextRequest) {
  return withQueryableRouteDatabase(async (context) => {
    const session = await readDatabaseSession(request, context.sessionStore)
    if (session === undefined) {
      return requiredSessionResponse()
    }

    const parsed = await parseJsonRoutePayload(
      request,
      createCampaignRequestSchema
    )
    if (parsed.kind === "response") {
      return parsed.response
    }

    const rateLimit = await context.authRateLimitRepository.consume(
      campaignRequestRateLimitRules(session.storeId)
    )
    if (rateLimit.kind === "blocked") {
      return rateLimitedResponse(rateLimit.retryAfterSeconds)
    }

    const created = await context.campaignStore.createCampaignRequest({
      id: randomUUID(),
      storeId: session.storeId,
      brief: parsed.value.brief,
      now: new Date(),
    })

    return Response.json({ request: created }, { status: 201 })
  })
}
