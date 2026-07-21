import { describe, expect, it } from "vitest"

import {
  InvalidCampaignTransitionError,
  transitionCampaignRequest,
} from "./campaign-state-machine"

describe("transitionCampaignRequest", () => {
  it("progresses submitted request into production and through review to approved", () => {
    let status = transitionCampaignRequest("submitted", {
      type: "START_PRODUCTION",
    })
    expect(status).toBe("in_production")

    status = transitionCampaignRequest(status, { type: "SUBMIT_FOR_REVIEW" })
    expect(status).toBe("ready_for_review")

    status = transitionCampaignRequest(status, {
      type: "SUBMIT_REVIEW_DECISION",
      decision: "go",
    })
    expect(status).toBe("approved")
  })

  it("handles changes_requested feedback loop back to in_production", () => {
    let status = transitionCampaignRequest("ready_for_review", {
      type: "SUBMIT_REVIEW_DECISION",
      decision: "changes_requested",
      note: "Use brighter colors in image 2",
    })
    expect(status).toBe("changes_requested")

    status = transitionCampaignRequest(status, { type: "START_PRODUCTION" })
    expect(status).toBe("in_production")
  })

  it("handles owner rejection (no_go)", () => {
    const status = transitionCampaignRequest("ready_for_review", {
      type: "SUBMIT_REVIEW_DECISION",
      decision: "no_go",
    })
    expect(status).toBe("rejected")
  })

  it("blocks publishing before owner approval", () => {
    expect(() =>
      transitionCampaignRequest("ready_for_review", {
        type: "START_PUBLISHING",
      })
    ).toThrow(InvalidCampaignTransitionError)

    expect(() =>
      transitionCampaignRequest("submitted", { type: "START_PUBLISHING" })
    ).toThrow(InvalidCampaignTransitionError)
  })

  it("allows publishing only from approved status", () => {
    const status = transitionCampaignRequest("approved", {
      type: "START_PUBLISHING",
    })
    expect(status).toBe("publishing")
  })

  it("evaluates publish progress statuses correctly", () => {
    // All published
    expect(
      transitionCampaignRequest("publishing", {
        type: "UPDATE_PUBLISH_PROGRESS",
        channelStatuses: ["published", "published"],
      })
    ).toBe("published")

    // All failed
    expect(
      transitionCampaignRequest("publishing", {
        type: "UPDATE_PUBLISH_PROGRESS",
        channelStatuses: ["failed", "failed"],
      })
    ).toBe("failed")

    // Partially published (1 published, 1 failed)
    expect(
      transitionCampaignRequest("publishing", {
        type: "UPDATE_PUBLISH_PROGRESS",
        channelStatuses: ["published", "failed"],
      })
    ).toBe("partially_published")

    // Still in progress
    expect(
      transitionCampaignRequest("publishing", {
        type: "UPDATE_PUBLISH_PROGRESS",
        channelStatuses: ["published", "publishing"],
      })
    ).toBe("publishing")
  })

  it("allows transition to failed from any in-flight state via FAIL_CAMPAIGN", () => {
    expect(
      transitionCampaignRequest("submitted", { type: "FAIL_CAMPAIGN" })
    ).toBe("failed")
    expect(
      transitionCampaignRequest("publishing", { type: "FAIL_CAMPAIGN" })
    ).toBe("failed")
    expect(
      transitionCampaignRequest("partially_published", {
        type: "FAIL_CAMPAIGN",
      })
    ).toBe("failed")
  })

  it("refuses to fail a campaign that already settled as published or rejected", () => {
    expect(() =>
      transitionCampaignRequest("published", { type: "FAIL_CAMPAIGN" })
    ).toThrow(InvalidCampaignTransitionError)

    expect(() =>
      transitionCampaignRequest("rejected", { type: "FAIL_CAMPAIGN" })
    ).toThrow(InvalidCampaignTransitionError)
  })

  it("reports an unrecognized review decision as a review error, not a publish error", () => {
    expect(() =>
      transitionCampaignRequest("ready_for_review", {
        type: "SUBMIT_REVIEW_DECISION",
        decision: "GO" as never,
      })
    ).toThrow(/Unrecognized review decision "GO"/)
  })
})
