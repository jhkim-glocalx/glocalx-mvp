"use client"

import { useState, type FormEvent } from "react"

import { ActionChip } from "@/app/_components/action-chip"
import { BottomNav } from "@/app/_components/bottom-nav"
import { ChatMessage } from "@/app/_components/chat-message"
import { isRecord, readString } from "@/app/_components/json-value"
import { MobileShell } from "@/app/_components/mobile-shell"
import { MetricCard, StatusCard } from "@/app/_components/status-card"

const appSteps = [
  { id: "onboarding", label: "온보딩" },
  { id: "post", label: "포스팅" },
] as const

type AppStepId = (typeof appSteps)[number]["id"]

const appNavItems = appSteps.map(({ id, label }) => ({ id, label }))
const appStepLabels = {
  onboarding: "온보딩",
  post: "포스팅",
} as const satisfies Record<AppStepId, string>

type DraftState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly draftId: string
      readonly kind: "ready"
      readonly koreanCopy: string
    }
  | { readonly kind: "error"; readonly message: string }

type PublishState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "published"; readonly message: string }
  | { readonly kind: "blocked"; readonly message: string }

function parseDraftState(payload: unknown): DraftState {
  if (!isRecord(payload)) {
    return { kind: "error", message: "초안 응답을 읽지 못했습니다." }
  }

  const preview = payload["preview"]
  if (!isRecord(preview)) {
    return { kind: "error", message: "초안 미리보기가 없습니다." }
  }

  return {
    draftId: readString(payload["draftId"]) ?? "draft-id-missing",
    kind: "ready",
    koreanCopy:
      readString(preview["koreanCopy"]) ?? "초안 문구를 다시 생성해주세요.",
  }
}

function parsePublishState(payload: unknown): PublishState {
  if (!isRecord(payload)) {
    return { kind: "blocked", message: "게시 응답을 읽지 못했습니다." }
  }

  const status = readString(payload["status"])
  if (status === "PUBLISHED") {
    return { kind: "published", message: "게시 완료" }
  }

  return {
    kind: "blocked",
    message:
      readString(payload["message"]) ??
      "Google 비즈니스 프로필 상태를 확인해주세요.",
  }
}

export function AppWorkspace() {
  const [activeStepId, setActiveStepId] = useState<AppStepId>("post")
  const [draft, setDraft] = useState<DraftState>({ kind: "idle" })
  const [intent, setIntent] = useState("주말 브런치 신메뉴 홍보")
  const [publish, setPublish] = useState<PublishState>({ kind: "idle" })

  function handleStepChange(stepId: string) {
    if (stepId === "onboarding" || stepId === "post") {
      setActiveStepId(stepId)
    }
  }

  async function handleDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDraft({ kind: "loading" })
    setPublish({ kind: "idle" })

    try {
      const response = await fetch("/api/posts/drafts", {
        body: JSON.stringify({
          ownerIntent: intent,
          storeId: "demo-store",
          targetChannel: "GBP",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      setDraft(parseDraftState(payload))
    } catch (error) {
      setDraft({
        kind: "error",
        message:
          error instanceof Error ? error.message : "초안 생성에 실패했습니다.",
      })
    }
  }

  async function handlePublish() {
    if (draft.kind !== "ready") {
      return
    }

    setPublish({ kind: "loading" })
    try {
      const response = await fetch(`/api/posts/${draft.draftId}/publish`, {
        body: JSON.stringify({ storeId: "demo-store" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      setPublish(parsePublishState(payload))
    } catch (error) {
      setPublish({
        kind: "blocked",
        message:
          error instanceof Error
            ? error.message
            : "게시 상태를 확인하지 못했습니다.",
      })
    }
  }

  return (
    <MobileShell
      bottomNav={
        <BottomNav
          activeId={activeStepId}
          items={appNavItems}
          onSelect={handleStepChange}
        />
      }
      testId="app-stage"
      topBar={
        <>
          <div>
            <p className="text-xs font-black text-[var(--accent)]">
              {appStepLabels[activeStepId]}
            </p>
            <p className="text-sm font-black text-[var(--ink)]">
              브런치모먼트 홍대점
            </p>
          </div>
          <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-black text-[var(--muted)]">
            GBP
          </span>
        </>
      }
    >
      {activeStepId === "onboarding" ? (
        <div className="grid gap-3">
          <ChatMessage
            message="가게 정보와 GBP 세팅 결과가 연결되었습니다."
            speaker="assistant"
          />
          <StatusCard label="상태" status="warning" value="인증 대기" />
          <StatusCard
            label="매장"
            status="success"
            value="브런치모먼트 홍대점"
          />
        </div>
      ) : (
        <div className="grid gap-4">
          <div>
            <p className="text-xs font-black text-[var(--accent)]">STEP 3</p>
            <h1 className="text-2xl font-black text-[var(--ink)]">
              포스팅 작업실
            </h1>
          </div>
          <ChatMessage
            message="GBP에 올릴 홍보 의도를 적어주시면 기존 API로 초안을 만들게요."
            speaker="assistant"
          />
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="채널" value="GBP" />
            <MetricCard label="모드" value="Stub" />
          </div>
          <form className="grid gap-3" onSubmit={handleDraft}>
            <label className="grid gap-2 text-sm font-black text-[var(--ink)]">
              홍보 의도
              <textarea
                className="min-h-24 resize-none rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                onChange={(event) => setIntent(event.currentTarget.value)}
                value={intent}
              />
            </label>
            <ActionChip
              buttonType="submit"
              disabled={draft.kind === "loading"}
              label={
                draft.kind === "loading" ? "초안 생성 중" : "GBP 초안 만들기"
              }
            />
          </form>
          {draft.kind === "ready" ? (
            <div className="grid gap-3">
              <StatusCard
                label="초안 준비"
                status="success"
                value="DRAFT_READY"
              />
              <p className="rounded-2xl bg-white p-4 text-sm font-bold leading-6 text-[var(--ink)]">
                {draft.koreanCopy}
              </p>
              <ActionChip
                disabled={publish.kind === "loading"}
                label={
                  publish.kind === "loading" ? "게시 확인 중" : "GBP 게시하기"
                }
                onClick={handlePublish}
              />
            </div>
          ) : null}
          {draft.kind === "error" ? (
            <p className="gx-inline-feedback text-sm font-bold">
              {draft.message}
            </p>
          ) : null}
          {publish.kind === "published" ? (
            <StatusCard
              label="게시 상태"
              status="success"
              value={publish.message}
            />
          ) : null}
          {publish.kind === "blocked" ? (
            <p className="gx-inline-feedback text-sm font-bold">
              {publish.message}
            </p>
          ) : null}
        </div>
      )}
    </MobileShell>
  )
}
