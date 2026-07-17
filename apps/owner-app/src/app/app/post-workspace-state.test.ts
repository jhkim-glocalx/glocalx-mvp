import { describe, expect, it } from "vitest"

import { parseDraftState } from "./post-workspace-state"

describe("legacy post workspace draft parser", () => {
  it("parses a ready draft response", () => {
    const state = parseDraftState({
      status: "DRAFT_READY",
      draftId: "draft-123",
      preview: {
        koreanCopy: "브런치모먼트 홍대점에서 주말 브런치 소식을 전합니다.",
      },
    })

    expect(state).toEqual({
      draftId: "draft-123",
      kind: "ready",
      koreanCopy: "브런치모먼트 홍대점에서 주말 브런치 소식을 전합니다.",
    })
  })

  it("rejects ready-looking draft responses without a draft id", () => {
    const state = parseDraftState({
      status: "DRAFT_READY",
      preview: {
        koreanCopy: "브런치모먼트 홍대점에서 주말 브런치 소식을 전합니다.",
      },
    })

    expect(state).toEqual({
      kind: "error",
      message: "초안 식별자가 없습니다.",
    })
  })

  it("rejects draft responses that are not ready", () => {
    const state = parseDraftState({
      status: "POST_DRAFT_GENERATION_FAILED",
      message: "AI 분석을 완료하지 못했습니다.",
      draftId: "stale-draft",
      preview: {
        koreanCopy: "이전 성공 응답처럼 보이는 초안입니다.",
      },
    })

    expect(state).toEqual({
      kind: "error",
      message: "AI 분석을 완료하지 못했습니다.",
    })
  })
})
