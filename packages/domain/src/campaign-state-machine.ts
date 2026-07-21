import { z } from "zod"

export const campaignStatusSchema = z.enum([
  "submitted",
  "in_production",
  "ready_for_review",
  "approved",
  "changes_requested",
  "rejected",
  "publishing",
  "published",
  "partially_published",
  "failed",
])
export type CampaignStatus = z.infer<typeof campaignStatusSchema>

export const campaignAssetKindSchema = z.enum(["original", "processed"])
export type CampaignAssetKind = z.infer<typeof campaignAssetKindSchema>

export const campaignAssetUploadedBySchema = z.enum(["owner", "admin"])
export type CampaignAssetUploadedBy = z.infer<
  typeof campaignAssetUploadedBySchema
>

export const campaignReviewActorSchema = z.enum(["owner", "admin"])
export type CampaignReviewActor = z.infer<typeof campaignReviewActorSchema>

export const campaignReviewDecisionSchema = z.enum([
  "go",
  "no_go",
  "changes_requested",
])
export type CampaignReviewDecision = z.infer<
  typeof campaignReviewDecisionSchema
>

export const publishChannelSchema = z.enum(["gbp", "instagram"])
export type PublishChannel = z.infer<typeof publishChannelSchema>

export const publishJobStatusSchema = z.enum([
  "queued",
  "publishing",
  "published",
  "failed",
])
export type PublishJobStatus = z.infer<typeof publishJobStatusSchema>

export type CampaignAction =
  | { readonly type: "START_PRODUCTION" }
  | { readonly type: "SUBMIT_FOR_REVIEW" }
  | {
      readonly type: "SUBMIT_REVIEW_DECISION"
      readonly decision: CampaignReviewDecision
      readonly note?: string
    }
  | { readonly type: "START_PUBLISHING" }
  | {
      readonly type: "UPDATE_PUBLISH_PROGRESS"
      readonly channelStatuses: readonly PublishJobStatus[]
    }
  | { readonly type: "FAIL_CAMPAIGN"; readonly reason?: string }

export class InvalidCampaignTransitionError extends Error {
  constructor(
    public readonly currentStatus: CampaignStatus,
    public readonly actionType: string,
    message?: string
  ) {
    super(
      message ??
        `Invalid campaign status transition from "${currentStatus}" via action "${actionType}".`
    )
    this.name = "InvalidCampaignTransitionError"
  }
}

export function transitionCampaignRequest(
  currentStatus: CampaignStatus,
  action: CampaignAction
): CampaignStatus {
  switch (action.type) {
    case "START_PRODUCTION": {
      if (
        currentStatus !== "submitted" &&
        currentStatus !== "changes_requested"
      ) {
        throw new InvalidCampaignTransitionError(
          currentStatus,
          action.type,
          `Cannot start production on campaign with status "${currentStatus}". Must be "submitted" or "changes_requested".`
        )
      }
      return "in_production"
    }

    case "SUBMIT_FOR_REVIEW": {
      if (currentStatus !== "in_production") {
        throw new InvalidCampaignTransitionError(
          currentStatus,
          action.type,
          `Cannot submit for review from status "${currentStatus}". Campaign must be "in_production".`
        )
      }
      return "ready_for_review"
    }

    case "SUBMIT_REVIEW_DECISION": {
      if (currentStatus !== "ready_for_review") {
        throw new InvalidCampaignTransitionError(
          currentStatus,
          action.type,
          `Cannot submit review decision on campaign with status "${currentStatus}". Must be "ready_for_review".`
        )
      }
      switch (action.decision) {
        case "go":
          return "approved"
        case "changes_requested":
          return "changes_requested"
        case "no_go":
          return "rejected"
        // Callers reach this with request- and database-derived decisions; without
        // a default the switch falls through to START_PUBLISHING and reports an
        // unrecognized decision as a publish failure.
        default:
          throw new InvalidCampaignTransitionError(
            currentStatus,
            action.type,
            `Unrecognized review decision "${String(action.decision)}". Must be "go", "no_go", or "changes_requested".`
          )
      }
    }

    case "START_PUBLISHING": {
      if (currentStatus !== "approved") {
        throw new InvalidCampaignTransitionError(
          currentStatus,
          action.type,
          `Cannot publish campaign with status "${currentStatus}". Explicit owner "go" (status "approved") is required.`
        )
      }
      return "publishing"
    }

    case "UPDATE_PUBLISH_PROGRESS": {
      if (currentStatus !== "publishing") {
        throw new InvalidCampaignTransitionError(
          currentStatus,
          action.type,
          `Cannot update publish progress when campaign status is "${currentStatus}". Must be "publishing".`
        )
      }
      if (action.channelStatuses.length === 0) {
        return "publishing"
      }

      const allPublished = action.channelStatuses.every(
        (s) => s === "published"
      )
      if (allPublished) {
        return "published"
      }

      const allFailed = action.channelStatuses.every((s) => s === "failed")
      if (allFailed) {
        return "failed"
      }

      const anyPending = action.channelStatuses.some(
        (s) => s === "queued" || s === "publishing"
      )
      if (anyPending) {
        return "publishing"
      }

      // Every channel is terminal and they are not uniform (all-published and
      // all-failed returned above), so some published and some failed.
      return "partially_published"
    }

    case "FAIL_CAMPAIGN": {
      // A campaign that reached a terminal outcome keeps it: overwriting
      // "published" with "failed" would erase the record that the post went
      // live, and the publish_jobs rows would still say otherwise.
      if (currentStatus === "published" || currentStatus === "rejected") {
        throw new InvalidCampaignTransitionError(
          currentStatus,
          action.type,
          `Cannot fail a campaign that already settled as "${currentStatus}".`
        )
      }
      return "failed"
    }

    default: {
      const _exhaustiveCheck: never = action
      throw new Error(`Unhandled action: ${JSON.stringify(_exhaustiveCheck)}`)
    }
  }
}
