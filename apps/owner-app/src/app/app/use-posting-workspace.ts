"use client"

import { useRef, useState } from "react"

import {
  createIdlePublishStates,
  parseDraftState,
  parsePostingDecisionTurnState,
  parsePublishState,
  previewKeyForDraft,
  type DraftState,
  type MarketingPlatform,
  type PostingChatTurn,
  type PostingDecisionTurnState,
  type PublishStates,
} from "./app-workspace-model"
import { readAppJsonResponse } from "./app-workspace-response"
import { imageAssetRequestPayloads } from "./image-asset-request-payloads"
import { useImageAssets } from "./use-image-assets"

const publishNetworkErrorMessage =
  "게시 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요."

export function usePostingWorkspace({
  onMoveToPosting,
  storeId,
}: {
  readonly onMoveToPosting: () => void
  readonly storeId: string
}) {
  const [activePreviewKey, setActivePreviewKey] = useState("GBP")
  const [draft, setDraft] = useState<DraftState>({ kind: "idle" })
  const [intent, setIntent] = useState("이번 주말 브런치 신메뉴 홍보")
  const [postingChatTurns, setPostingChatTurns] = useState<
    readonly PostingChatTurn[]
  >([])
  const [postingDecision, setPostingDecision] =
    useState<PostingDecisionTurnState>({ kind: "idle" })
  const [postingSessionId, setPostingSessionId] = useState<string>()
  const [publishByPlatform, setPublishByPlatform] = useState<PublishStates>(
    createIdlePublishStates
  )
  const publishInFlightRef = useRef(false)
  const { handleImageFiles, imageAssets } = useImageAssets({
    onImagesSelected: () => {
      // Media changes alter the draft payload hash, so posting state is reset with the selection.
      setDraft({ kind: "idle" })
      setPostingChatTurns([])
      setPostingDecision({ kind: "idle" })
      setPostingSessionId(undefined)
      setPublishByPlatform(createIdlePublishStates())
    },
    onInvalidImage: (message) => {
      setDraft({ kind: "error", message })
    },
  })

  async function requestDraft(options: {
    readonly acceptedSuggestionId?: string
    readonly nextIntent?: string
    readonly suggestionMode: "request" | "accepted" | "skipped"
  }) {
    const ownerIntent = options.nextIntent ?? intent
    if (imageAssets.length === 0) {
      setDraft({
        kind: "error",
        message: "게시물에 사용할 이미지를 먼저 업로드해주세요.",
      })
      return
    }

    setDraft({ kind: "loading" })
    setPostingDecision({ kind: "idle" })
    setPublishByPlatform(createIdlePublishStates())
    try {
      const response = await fetch("/api/posts/drafts", {
        body: JSON.stringify({
          ...(options.acceptedSuggestionId === undefined
            ? {}
            : { acceptedSuggestionId: options.acceptedSuggestionId }),
          imageAssets: imageAssetRequestPayloads(imageAssets),
          ownerIntent,
          storeId,
          suggestionMode: options.suggestionMode,
          targetChannel: "GBP",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload = await readAppJsonResponse(
        response,
        "마케팅 초안을 생성하지 못했습니다."
      )
      const nextDraft = parseDraftState(payload)
      setDraft(nextDraft)
      setActivePreviewKey(previewKeyForDraft(nextDraft))
    } catch (caught) {
      setDraft({
        kind: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "마케팅 초안을 생성하지 못했습니다.",
      })
    }
  }

  async function submitDraft() {
    setPostingChatTurns([])
    setPostingDecision({ kind: "idle" })
    setPostingSessionId(undefined)
    await requestDraft({ suggestionMode: "request" })
  }

  async function replyToSuggestion(ownerMessage: string) {
    if (draft.kind !== "ready" || draft.suggestion === null) {
      return
    }

    const clientEventId = window.crypto.randomUUID()
    // The client event id lets the route replay retries without classifying the same reply twice.
    setPostingChatTurns((currentTurns) => [
      ...currentTurns,
      {
        id: `owner-${clientEventId}`,
        message: ownerMessage,
        speaker: "owner",
      },
    ])
    setPostingDecision({ kind: "loading" })
    setPublishByPlatform(createIdlePublishStates())

    try {
      const response = await fetch("/api/posts/conversation/decision", {
        body: JSON.stringify({
          activeSuggestionId: draft.suggestion.id,
          clientEventId,
          draftId: draft.draftId,
          draftSummary: draft.koreanCopy,
          imageAssets: imageAssetRequestPayloads(imageAssets),
          ownerIntent: intent,
          ownerMessage,
          ...(postingSessionId === undefined
            ? {}
            : { sessionId: postingSessionId }),
          storeId,
          suggestionMessage: draft.suggestion.message,
          suggestionRevisedIntent: draft.suggestion.revisedIntent,
          targetChannel: activePreviewKey === "INSTAGRAM" ? "INSTAGRAM" : "GBP",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload = await readAppJsonResponse(
        response,
        "제안 응답을 처리하지 못했습니다."
      )
      const nextDecision = parsePostingDecisionTurnState(payload)
      setPostingDecision(nextDecision)
      if (nextDecision.kind !== "ready") {
        return
      }

      setPostingSessionId(nextDecision.sessionId)
      if (nextDecision.revisedIntent !== null) {
        setIntent(nextDecision.revisedIntent)
      }
      setPostingChatTurns((currentTurns) => [
        ...currentTurns,
        {
          id: `assistant-${clientEventId}`,
          message: nextDecision.assistantMessage,
          speaker: "assistant",
        },
      ])
      if (nextDecision.draft !== null) {
        setDraft(nextDecision.draft)
        setActivePreviewKey(previewKeyForDraft(nextDecision.draft))
        onMoveToPosting()
      }
      setPostingDecision({ kind: "idle" })
    } catch (caught) {
      setPostingDecision({
        kind: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "제안 응답을 처리하지 못했습니다.",
      })
    }
  }

  async function acceptSuggestion() {
    await replyToSuggestion("좋아, 제안 반영해줘")
  }

  async function skipSuggestion() {
    await replyToSuggestion("그냥 진행할게")
  }

  async function publishDraft(targetChannel: MarketingPlatform) {
    const channelPublish = publishByPlatform[targetChannel]
    if (publishInFlightRef.current || channelPublish.kind === "published") {
      return
    }
    if (draft.kind !== "ready") {
      // The client blocks empty publishes; the route owns idempotency and retry-limit enforcement.
      setPublishByPlatform((current) => ({
        ...current,
        [targetChannel]: {
          kind: "blocked",
          message:
            "먼저 사진과 알리고 싶은 말이나 단어를 분석해 게시물 초안을 만들어주세요.",
          targetChannel,
        },
      }))
      return
    }

    publishInFlightRef.current = true
    setPublishByPlatform((current) => ({
      ...current,
      [targetChannel]: { kind: "loading", targetChannel },
    }))
    try {
      const response = await fetch(`/api/posts/${draft.draftId}/publish`, {
        body: JSON.stringify({ storeId, targetChannel }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload = await readAppJsonResponse(
        response,
        publishNetworkErrorMessage
      )
      setPublishByPlatform((current) => ({
        ...current,
        [targetChannel]: parsePublishState(payload, targetChannel),
      }))
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error
      }
      setPublishByPlatform((current) => ({
        ...current,
        [targetChannel]: {
          kind: "blocked",
          message: publishNetworkErrorMessage,
          targetChannel,
        },
      }))
    } finally {
      publishInFlightRef.current = false
    }
  }

  function selectPreview(previewKey: string) {
    setActivePreviewKey(previewKey)
  }

  return {
    acceptSuggestion,
    activePreviewKey,
    draft,
    handleImageFiles,
    imageAssets,
    intent,
    postingChatTurns,
    postingDecision,
    publish:
      publishByPlatform[activePreviewKey === "INSTAGRAM" ? "INSTAGRAM" : "GBP"],
    publishDraft,
    replyToSuggestion,
    setActivePreviewKey: selectPreview,
    setIntent,
    skipSuggestion,
    submitDraft,
  }
}
