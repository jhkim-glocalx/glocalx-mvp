import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"

import {
  parseJsonRoutePayload,
  readDemoSession,
  requiredSessionResponse,
} from "@/server/http"
import { postDraftRequestSchema } from "@/domain/schemas"

describe("shared API route request context", () => {
  it("returns the existing validation JSON when request JSON is malformed", async () => {
    // Given
    const request = new NextRequest("http://localhost:3000/api/posts/drafts", {
      body: "{",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })

    // When
    const result = await parseJsonRoutePayload(request, postDraftRequestSchema)

    // Then
    expect(result.kind).toBe("response")
    if (result.kind === "response") {
      expect(result.response.status).toBe(400)
      expect(await result.response.json()).toEqual({
        message: "요청 JSON을 읽을 수 없습니다.",
        status: "VALIDATION_ERROR",
      })
    }
  })

  it("returns the existing auth JSON when a session is missing", async () => {
    // Given
    const request = new NextRequest("http://localhost:3000/api/posts/drafts", {
      method: "POST",
    })

    // When
    const session = readDemoSession(request)
    const response = requiredSessionResponse()

    // Then
    expect(session).toBeUndefined()
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      message: "로그인이 필요합니다.",
      status: "AUTH_REQUIRED",
    })
  })
})
