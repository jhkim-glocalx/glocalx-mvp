import type { NextRequest } from "next/server"

import {
  campaignConflictResponse,
  campaignRequestNotFoundResponse,
  toQueueRequestResponse,
} from "@/app/api/queue/queue-responses"
import {
  postCampaignAssistantNotice,
  publishRetryLimitNoticeBody,
} from "@/server/campaign-chat-notice"
import {
  resolvePublishEligibility,
  runCampaignPublish,
} from "@/server/campaign-publish"
import { applyCampaignAction } from "@/server/queue-view"
import { parseAdminJson, withAdminRoute } from "@/server/route-database"
import type { CampaignRequestDetail } from "@glocalx/db/support/campaign-store"
import { startCampaignPublishRequestSchema } from "@glocalx/domain/campaign-contracts"
import {
  publishJobMaxAttempts,
  type CampaignAction,
  type PublishChannel,
} from "@glocalx/domain/campaign-state-machine"

type QueueRequestRouteContext = {
  readonly params: Promise<{ readonly requestId: string }>
}

function publishBlockedResponse(
  channel: PublishChannel,
  message: string
): Response {
  return Response.json(
    { status: "CHANNEL_NOT_ELIGIBLE", channel, message },
    { status: 422 }
  )
}

function incompleteMaterialResponse(message: string): Response {
  return Response.json(
    { status: "INCOMPLETE_MATERIAL", message },
    { status: 422 }
  )
}

// A publish run starts from the owner's "go" (approved) or resumes a settled-
// but-incomplete outcome. Anything else — still in production, awaiting review,
// rejected, already fully published, or a run currently in flight — is a stale
// screen, and the domain transition function is what says so.
function publishActionForStatus(
  status: CampaignRequestDetail["status"]
): CampaignAction | undefined {
  if (status === "approved") {
    return { type: "START_PUBLISHING" }
  }
  if (status === "failed" || status === "partially_published") {
    return { type: "RETRY_PUBLISHING" }
  }
  return undefined
}

// Publishing runs inline: the operator triggered it and is waiting on the
// result, and at cohort scale two channel calls sit far inside the function
// timeout. The campaign's own `publishing` status is the in-flight lock, so a
// second click while this runs loses the guarded update and is told it raced.
export async function POST(
  request: NextRequest,
  routeContext: QueueRequestRouteContext
) {
  const { requestId } = await routeContext.params
  return withAdminRoute(
    request,
    async (context) => {
      const parsed = await parseAdminJson(
        request,
        startCampaignPublishRequestSchema
      )
      if (parsed.kind === "response") {
        return parsed.response
      }
      const channels = parsed.value.channels

      const current =
        await context.campaignStore.getCampaignRequestForOperator(requestId)
      if (current === undefined) {
        return campaignRequestNotFoundResponse()
      }

      if (!current.assets.some((asset) => asset.kind === "processed")) {
        return incompleteMaterialResponse(
          "This request has no processed asset to publish."
        )
      }
      if (current.finalCopy === null || current.finalCopy.trim().length === 0) {
        return incompleteMaterialResponse(
          "This request has no final copy to publish."
        )
      }

      // Re-checked server-side rather than trusted from the panel: the same
      // verdict that greys out a button has to refuse a hand-rolled POST.
      const eligibility = await resolvePublishEligibility(
        context.publishTargetStore,
        current.storeId
      )
      for (const channel of channels) {
        const verdict = eligibility[channel]
        if (verdict.kind === "blocked") {
          return publishBlockedResponse(channel, verdict.message)
        }
      }

      const action = publishActionForStatus(current.status)
      if (action === undefined) {
        return campaignConflictResponse(current.status)
      }

      const now = new Date()
      const started = await applyCampaignAction(
        context.campaignStore,
        requestId,
        action,
        now
      )
      if (started.kind === "not_found") {
        return campaignRequestNotFoundResponse()
      }
      if (started.kind === "conflict") {
        return campaignConflictResponse(started.currentStatus)
      }

      const outcomes = await runCampaignPublish({
        adapters: context.adapters,
        orgCredentialStore: context.orgCredentialStore,
        publishJobStore: context.publishJobStore,
        publishTargetStore: context.publishTargetStore,
        request: started.request,
        channels,
        now,
      })

      // Progress is computed from every job on the request, not just the ones
      // this run touched: a retry that fixes the one failed channel must be
      // able to settle the campaign as fully published.
      const jobs = await context.publishJobStore.listPublishJobs(requestId)
      const settled = await applyCampaignAction(
        context.campaignStore,
        requestId,
        {
          type: "UPDATE_PUBLISH_PROGRESS",
          channelStatuses: jobs.map((job) => job.status),
        },
        now
      )

      const exhausted = jobs
        .filter(
          (job) =>
            job.status === "failed" && job.attemptCount >= publishJobMaxAttempts
        )
        .map((job) => job.channel)
      if (exhausted.length > 0) {
        // architecture.md §2: the owner must not be left waiting on a job that
        // will never retry itself.
        await postCampaignAssistantNotice({
          csConversationStore: context.csConversationStore,
          csMessageStore: context.csMessageStore,
          storeId: current.storeId,
          body: publishRetryLimitNoticeBody(exhausted),
          now,
        })
      }

      await context.auditLogStore.record({
        action: "campaign_publish",
        adminUserId: context.adminUserId,
        storeId: current.storeId,
        campaignRequestId: requestId,
        detail: {
          channels: channels.join(","),
          outcomes: outcomes
            .map((outcome) => `${outcome.channel}:${outcome.kind}`)
            .join(","),
        },
      })

      const detail =
        settled.kind === "applied"
          ? settled.request
          : await context.campaignStore.getCampaignRequestForOperator(requestId)
      if (detail === undefined) {
        return campaignRequestNotFoundResponse()
      }

      return Response.json({
        request: await toQueueRequestResponse(context, detail),
        outcomes,
      })
    },
    { requireSameOrigin: true }
  )
}
