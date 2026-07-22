import { randomUUID } from "node:crypto"

import type { NextRequest } from "next/server"

import { toOwnerCampaignRequestView } from "@/campaigns/request-view"
import { campaignStatusLabel } from "@/campaigns/status-labels"
import {
  parseJsonRoutePayload,
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"
import { submitCampaignReviewDecisionRequestSchema } from "@glocalx/domain/campaign-contracts"
import {
  InvalidCampaignTransitionError,
  transitionCampaignRequest,
} from "@glocalx/domain/campaign-state-machine"
import type { CampaignStatus } from "@glocalx/domain/campaign-state-machine"

type CampaignRequestRouteContext = {
  // Next canary provides dynamic route params as a promise in route handlers.
  readonly params: Promise<{ readonly requestId: string }>
}

function campaignRequestNotFoundResponse(): Response {
  return Response.json(
    { status: "NOT_FOUND", message: "요청을 찾을 수 없습니다." },
    { status: 404 }
  )
}

// The stale-screen answer (delivery-plan Phase 3 acceptance). The owner's
// screen showed "검토 대기" but the request has since moved — say what it is
// now rather than a generic failure, so reloading is an obvious next step.
function campaignStatusConflictResponse(
  currentStatus: CampaignStatus
): Response {
  return Response.json(
    {
      status: "STATUS_CONFLICT",
      currentStatus,
      message: `이 요청은 이미 '${campaignStatusLabel(currentStatus)}' 상태로 변경되었습니다. 새로고침 후 다시 확인해주세요.`,
    },
    { status: 409 }
  )
}

// The owner's go / no-go / request-changes decision. Two things can make this a
// conflict and both mean the same thing to the owner: the domain transition
// function refusing the action outright (the status already moved), and the
// store's guarded write matching zero rows (it moved between this read and this
// write — the double-submit case). The guarded write is also what keeps rapid
// duplicate clicks to exactly one campaign_review_events row.
export async function POST(
  request: NextRequest,
  routeContext: CampaignRequestRouteContext
) {
  const { requestId } = await routeContext.params
  return withQueryableRouteDatabase(async (context) => {
    const session = await readDatabaseSession(request, context.sessionStore)
    if (session === undefined) {
      return requiredSessionResponse()
    }

    const parsed = await parseJsonRoutePayload(
      request,
      submitCampaignReviewDecisionRequestSchema
    )
    if (parsed.kind === "response") {
      return parsed.response
    }

    const current = await context.campaignStore.getCampaignRequestDetail(
      requestId,
      session.storeId
    )
    if (current === undefined) {
      return campaignRequestNotFoundResponse()
    }

    let nextStatus: CampaignStatus
    try {
      nextStatus = transitionCampaignRequest(current.status, {
        type: "SUBMIT_REVIEW_DECISION",
        decision: parsed.value.decision,
        ...(parsed.value.note === undefined ? {} : { note: parsed.value.note }),
      })
    } catch (error) {
      if (error instanceof InvalidCampaignTransitionError) {
        return campaignStatusConflictResponse(current.status)
      }
      throw error
    }

    const updated = await context.campaignStore.recordCampaignReviewDecision({
      id: randomUUID(),
      requestId,
      expectedStatus: current.status,
      nextStatus,
      actor: "owner",
      decision: parsed.value.decision,
      ...(parsed.value.note === undefined ? {} : { note: parsed.value.note }),
      now: new Date(),
    })
    if (updated === undefined) {
      const latest = await context.campaignStore.getCampaignRequestDetail(
        requestId,
        session.storeId
      )
      return latest === undefined
        ? campaignRequestNotFoundResponse()
        : campaignStatusConflictResponse(latest.status)
    }

    const detail = await context.campaignStore.getCampaignRequestDetail(
      requestId,
      session.storeId
    )
    if (detail === undefined) {
      return campaignRequestNotFoundResponse()
    }
    return Response.json({
      request: await toOwnerCampaignRequestView(
        context.adapters.mediaStore,
        detail
      ),
    })
  })
}
