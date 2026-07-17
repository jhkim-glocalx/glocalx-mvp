"use client"

import { useState, type FormEvent } from "react"

import { ActionChip } from "@/app/_components/action-chip"
import { ChatMessage } from "@/app/_components/chat-message"

import {
  ChatFeedback,
  DraftPreview,
  TypingIndicator,
} from "./post-workspace-components"
import {
  parseDraftState,
  parsePublishState,
  type DraftState,
  type PublishState,
} from "./post-workspace-state"

type PostWorkspaceProps = {
  readonly storeId: string
}

export function PostWorkspace({ storeId }: PostWorkspaceProps) {
  const [draft, setDraft] = useState<DraftState>({ kind: "idle" })
  const [intent, setIntent] = useState("주말 브런치 신메뉴 홍보")
  const [submittedIntent, setSubmittedIntent] = useState<string>()
  const [publish, setPublish] = useState<PublishState>({ kind: "idle" })

  async function handleDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmittedIntent(intent)
    setDraft({ kind: "loading" })
    setPublish({ kind: "idle" })

    try {
      const response = await fetch("/api/posts/drafts", {
        body: JSON.stringify({
          ownerIntent: intent,
          storeId,
          targetChannel: "GBP",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      setDraft(parseDraftState(payload))
    } catch (caught) {
      setDraft({
        kind: "error",
        message:
          caught instanceof Error
            ? caught.message
            : "초안 생성에 실패했습니다.",
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
        body: JSON.stringify({ storeId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      setPublish(parsePublishState(payload))
    } catch (caught) {
      setPublish({
        kind: "blocked",
        message:
          caught instanceof Error
            ? caught.message
            : "게시 상태를 확인하지 못했습니다.",
      })
    }
  }

  return (
    <section className="flex min-h-full flex-col gap-4">
      <div className="grid gap-2">
        <p className="text-xs font-black text-[var(--accent)]">
          여러 SNS 자동홍보 채팅
        </p>
        <h1 className="text-xl font-black leading-7 text-[var(--ink)]">
          포스팅 작업실
        </h1>
        <p className="text-sm font-bold leading-6 text-[var(--ink-soft)]">
          오늘 올릴 매장 소식을 바로 작성합니다
        </p>
      </div>

      <div
        aria-label="AI 마케팅 채팅"
        className="grid flex-1 content-start gap-3"
      >
        <ChatMessage
          message="브런치모먼트 홍대점의 Google 비즈니스 프로필에 올릴 글을 준비할게요. 알리고 싶은 말이나 단어를 남기면 초안과 게시 상태를 여기서 바로 확인할 수 있습니다."
          speaker="assistant"
        />
        {submittedIntent ? (
          <ChatMessage message={submittedIntent} speaker="owner" />
        ) : null}
        {draft.kind === "loading" ? (
          <TypingIndicator label="초안을 작성하는 중" />
        ) : null}
        {draft.kind === "ready" ? (
          <DraftPreview
            copy={draft.koreanCopy}
            disabled={publish.kind === "loading"}
            onPublish={handlePublish}
          />
        ) : null}
        {draft.kind === "error" ? (
          <ChatFeedback
            message={draft.message}
            title="초안 생성 실패"
            tone="warning"
          />
        ) : null}
        {publish.kind === "loading" ? (
          <TypingIndicator label="GBP 게시 상태를 확인하는 중" />
        ) : null}
        {publish.kind === "published" ? (
          <ChatFeedback
            message={publish.message}
            title="게시 완료"
            tone="success"
          />
        ) : null}
        {publish.kind === "blocked" ? (
          <ChatFeedback
            message={publish.message}
            title="게시 확인 필요"
            tone="warning"
          />
        ) : null}
      </div>

      <form
        className="grid gap-3 rounded-[22px] border border-[var(--line)] bg-white p-3 shadow-[0_18px_42px_-36px_rgba(25,23,32,0.7)]"
        onSubmit={handleDraft}
      >
        <label className="grid gap-2 text-sm font-black text-[var(--ink)]">
          알리고 싶은 말이나 단어
          <textarea
            className="min-h-24 resize-none rounded-2xl border border-[var(--line)] bg-[var(--phone-bg)] px-4 py-3 text-sm font-bold leading-6 outline-none focus:border-[var(--accent)]"
            onChange={(event) => setIntent(event.currentTarget.value)}
            value={intent}
          />
        </label>
        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
          <div className="min-w-0 text-[11px] font-bold leading-4 text-[var(--muted)]">
            <p className="truncate">채널 GBP · 매장 브런치모먼트 홍대점</p>
            <p className="truncate">AI 마케팅 매니저가 문구를 작성합니다</p>
          </div>
          <div className="w-36">
            <ActionChip
              buttonType="submit"
              disabled={draft.kind === "loading" || publish.kind === "loading"}
              label="문구 초안 만들기"
            />
          </div>
        </div>
      </form>
    </section>
  )
}
