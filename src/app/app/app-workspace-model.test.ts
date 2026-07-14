import { describe, expect, it } from "vitest"

import {
  parseDraftState,
  parsePublishState,
  platformPreviewKey,
} from "./app-workspace-model"

describe("app workspace draft parser", () => {
  it("uses an Instagram-specific fallback for malformed publish errors", () => {
    // Given
    const payload = { status: "FAILED" }

    // When
    const state = parsePublishState(payload, "INSTAGRAM")

    // Then
    expect(state).toEqual({
      kind: "blocked",
      message: "Instagram 비즈니스 계정 연결 상태를 확인해주세요.",
      targetChannel: "INSTAGRAM",
    })
  })

  it("parses a text-only ready draft without image-led preview fields", () => {
    // Given
    const payload = {
      status: "DRAFT_READY",
      draftId: "draft-text-only",
      preview: {
        canPublish: true,
        englishCopy: "Sharing the weekend brunch update.",
        koreanCopy: "브런치모먼트 홍대점에서 주말 브런치 소식을 전합니다.",
      },
    }

    // When
    const state = parseDraftState(payload)

    // Then
    expect(state).toMatchObject({
      draftId: "draft-text-only",
      images: [],
      kind: "ready",
      koreanCopy: "브런치모먼트 홍대점에서 주말 브런치 소식을 전합니다.",
      platformPreviews: [
        {
          copy: "브런치모먼트 홍대점에서 주말 브런치 소식을 전합니다.",
          locale: "ko",
          platform: "GBP",
          translations: [
            {
              copy: "Sharing the weekend brunch update.",
              label: "English",
              locale: "en",
            },
            {
              label: "Japanese",
              locale: "ja",
            },
            {
              label: "Chinese",
              locale: "zh",
            },
          ],
        },
      ],
    })
  })

  it("collapses legacy language previews into translation buttons", () => {
    // Given
    const payload = {
      status: "DRAFT_READY",
      draftId: "draft-legacy-language-preview",
      preview: {
        canPublish: true,
        englishCopy: "Sharing the weekend brunch update.",
        koreanCopy: "브런치모먼트 홍대점에서 주말 브런치 소식을 전합니다.",
        platformPreviews: [
          {
            copy: "브런치모먼트 홍대점에서 주말 브런치 소식을 전합니다.",
            locale: "ko",
            platform: "GBP",
            translations: [
              {
                copy: "週末ブランチのお知らせです。",
                label: "Weekend brunch Japanese",
                locale: "ja",
              },
            ],
          },
          {
            copy: "Weekend brunch news from Brunch Moment.",
            label: "Legacy English",
            locale: "en",
            platform: "GBP",
          },
        ],
      },
    }

    // When
    const state = parseDraftState(payload)

    // Then
    expect(state.kind).toBe("ready")
    if (state.kind === "ready") {
      expect(state.platformPreviews).toHaveLength(1)
      const firstPreview = state.platformPreviews[0]
      if (firstPreview !== undefined) {
        expect(firstPreview).toMatchObject({
          copy: "브런치모먼트 홍대점에서 주말 브런치 소식을 전합니다.",
          locale: "ko",
          platform: "GBP",
        })
        expect(firstPreview.translations).toHaveLength(3)
        expect(firstPreview.translations[0]).toMatchObject({
          copy: "Weekend brunch news from Brunch Moment.",
          label: "English",
          locale: "en",
        })
        expect(firstPreview.translations[1]).toMatchObject({
          copy: "週末ブランチのお知らせです。",
          label: "Japanese",
          locale: "ja",
        })
        expect(platformPreviewKey(firstPreview)).toBe("GBP")
      }
    }
  })

  it("returns an error when a ready draft payload is missing draftId", () => {
    // Given
    const payload = {
      status: "DRAFT_READY",
      preview: {
        canPublish: true,
        englishCopy: "Sharing the weekend brunch update.",
        koreanCopy: "브런치모먼트 홍대점에서 주말 브런치 소식을 전합니다.",
      },
    }

    // When
    const state = parseDraftState(payload)

    // Then
    expect(state).toEqual({
      kind: "error",
      message: "초안 식별자가 없습니다.",
    })
  })

  it("returns an error when stale preview data is not a ready draft response", () => {
    // Given
    const payload = {
      status: "VALIDATION_ERROR",
      draftId: "draft-stale-preview",
      preview: {
        canPublish: true,
        englishCopy: "Stale success-looking data.",
        koreanCopy: "이전 성공 응답처럼 보이는 초안입니다.",
      },
    }

    // When
    const state = parseDraftState(payload)

    // Then
    expect(state).toEqual({
      kind: "error",
      message: "초안 생성이 완료되지 않았습니다.",
    })
  })

  it("preserves the server message when draft generation fails", () => {
    // Given
    const payload = {
      status: "POST_DRAFT_GENERATION_FAILED",
      message: "AI 분석을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.",
    }

    // When
    const state = parseDraftState(payload)

    // Then
    expect(state).toEqual({
      kind: "error",
      message: "AI 분석을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.",
    })
  })

  it("returns an error when a ready draft payload is missing Korean copy", () => {
    // Given
    const payload = {
      status: "DRAFT_READY",
      draftId: "draft-missing-copy",
      preview: {
        canPublish: true,
        englishCopy: "Sharing the weekend brunch update.",
      },
    }

    // When
    const state = parseDraftState(payload)

    // Then
    expect(state).toEqual({
      kind: "error",
      message: "초안 문구가 없습니다.",
    })
  })

  it("preserves blocked credentials generation status from ready previews", () => {
    // Given
    const payload = {
      status: "DRAFT_READY",
      draftId: "draft-blocked-credentials",
      preview: {
        canPublish: true,
        englishCopy: "Sharing the weekend brunch update.",
        generationStatus: {
          kind: "blocked_by_credentials",
          missingEnvVars: ["OPENAI_API_KEY"],
        },
        koreanCopy: "브런치모먼트 홍대점에서 주말 브런치 소식을 전합니다.",
      },
    }

    // When
    const state = parseDraftState(payload)

    // Then
    expect(state).toMatchObject({
      generationStatus: "LLM credentials required",
      kind: "ready",
    })
  })
})
