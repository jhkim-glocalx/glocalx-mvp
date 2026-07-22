"use client"

import { useState } from "react"

import { isRecord, readString } from "@/app/_components/json-value"

import {
  fetchCampaignRequestDetail,
  submitCampaignReviewDecision,
} from "./campaign-requests"
import {
  readErrorMessage,
  toCampaignRequestDetail,
  type CampaignRequestDetail,
} from "./campaign-model"

export type CampaignReviewNotice = {
  readonly tone: "info" | "error"
  readonly message: string
}

const genericDecisionErrorMessage =
  "결정을 저장하지 못했습니다. 잠시 후 다시 시도해주세요."

const decisionConfirmations: Record<string, string> = {
  go: "승인했습니다. 게시 준비가 시작되면 알려드릴게요.",
  changes_requested: "수정 요청을 전달했습니다. 담당자가 다시 작업합니다.",
  no_go: "반려 처리했습니다.",
}

// The two server answers that mean the card on screen no longer describes
// anything real — the request moved on, or it isn't there at all. Every other
// failure is worth retrying against the same card.
const staleResponseCodes = new Set(["STATUS_CONFLICT", "NOT_FOUND"])

export function useCampaignReview(onRequestsChanged: () => Promise<void>) {
  const [reviewing, setReviewing] = useState<CampaignRequestDetail | null>(null)
  const [note, setNote] = useState("")
  const [notice, setNotice] = useState<CampaignReviewNotice | null>(null)
  const [busy, setBusy] = useState(false)

  async function openReview(requestId: string): Promise<void> {
    setBusy(true)
    setNotice(null)
    try {
      const detail = toCampaignRequestDetail(
        await fetchCampaignRequestDetail(requestId)
      )
      if (detail === undefined) {
        setNotice({ tone: "error", message: "요청을 불러오지 못했습니다." })
        return
      }
      setReviewing(detail)
      setNote("")
    } finally {
      setBusy(false)
    }
  }

  function closeReview(): void {
    setReviewing(null)
    setNote("")
    setNotice(null)
  }

  async function decide(decision: string): Promise<void> {
    const request = reviewing
    if (request === null || busy) {
      return
    }
    if (decision === "changes_requested" && note.trim() === "") {
      setNotice({
        tone: "error",
        message: "어떤 부분을 수정할지 알려주세요.",
      })
      return
    }

    setBusy(true)
    try {
      const payload = await submitCampaignReviewDecision(
        request.id,
        decision,
        decision === "changes_requested" ? note.trim() : undefined
      )
      await handleDecisionOutcome(payload, decision)
    } catch {
      setNotice({ tone: "error", message: genericDecisionErrorMessage })
    } finally {
      setBusy(false)
    }
  }

  // What the owner sees once the server has answered their 승인 / 수정 요청 /
  // 반려. A settled request has nothing left to decide, so success closes the
  // card and confirms in the status list the card was opened from. A stale
  // request is closed too — leaving it up would invite a second tap on a
  // screen that is already wrong. Everything else keeps the card so the owner
  // can simply tap again.
  async function handleDecisionOutcome(
    payload: unknown,
    decision: string
  ): Promise<void> {
    const settled = toCampaignRequestDetail(payload)
    if (settled !== undefined) {
      setReviewing(null)
      setNote("")
      setNotice({
        tone: "info",
        message: decisionConfirmations[decision] ?? "결정을 전달했습니다.",
      })
      await onRequestsChanged()
      return
    }

    const code = isRecord(payload) ? readString(payload["status"]) : undefined
    const message = readErrorMessage(payload, genericDecisionErrorMessage)
    if (code !== undefined && staleResponseCodes.has(code)) {
      setReviewing(null)
      setNote("")
      setNotice({ tone: "error", message })
      // The list is the only thing left on screen, so it has to be current.
      await onRequestsChanged()
      return
    }

    setNotice({ tone: "error", message })
  }

  return {
    busy,
    closeReview,
    decide,
    note,
    notice,
    openReview,
    reviewing,
    setNote,
  }
}
