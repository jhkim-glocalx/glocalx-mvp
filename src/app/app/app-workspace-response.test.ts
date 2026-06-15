import { describe, expect, it } from "vitest"

import { readAppJsonResponse } from "./app-workspace-response"

describe("app workspace response reader", () => {
  it("returns parsed JSON for normal route responses", async () => {
    // Given
    const response = Response.json({
      status: "DRAFT_READY",
      draftId: "draft-sample",
    })

    // When
    const payload = await readAppJsonResponse(response, "fallback")

    // Then
    expect(payload).toEqual({
      status: "DRAFT_READY",
      draftId: "draft-sample",
    })
  })

  it("turns empty responses into product errors", async () => {
    // Given
    const response = new Response("", { status: 500 })

    // When
    const payload = await readAppJsonResponse(
      response,
      "마케팅 초안을 생성하지 못했습니다."
    )

    // Then
    expect(payload).toEqual({
      status: "EMPTY_RESPONSE",
      message: "마케팅 초안을 생성하지 못했습니다.",
    })
  })

  it("turns malformed JSON into product errors", async () => {
    // Given
    const response = new Response("<html>error</html>", { status: 500 })

    // When
    const payload = await readAppJsonResponse(
      response,
      "제안 응답을 처리하지 못했습니다."
    )

    // Then
    expect(payload).toEqual({
      status: "INVALID_JSON_RESPONSE",
      message: "제안 응답을 처리하지 못했습니다.",
    })
  })
})
