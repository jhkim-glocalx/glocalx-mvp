"use client"

import { useState, type FormEvent } from "react"

import { ActionChip } from "@/app/_components/action-chip"
import { BottomNav } from "@/app/_components/bottom-nav"
import { ChatMessage } from "@/app/_components/chat-message"
import { isRecord, readString } from "@/app/_components/json-value"
import { MobileShell } from "@/app/_components/mobile-shell"

const appNavItems = [
  { id: "home", label: "홈" },
  { id: "post", label: "포스팅" },
  { id: "insights", label: "성과" },
] as const

type AppNavId = (typeof appNavItems)[number]["id"]

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

type AppWorkspaceProps = {
  readonly storeId: string
}

type TypingIndicatorProps = {
  readonly label: string
}

function TypingIndicator({ label }: TypingIndicatorProps) {
  return (
    <div
      aria-label={label}
      className="inline-flex max-w-[92%] items-center gap-3 rounded-[18px] bg-white px-4 py-3 text-sm font-bold text-[var(--muted)]"
      role="status"
    >
      <span>{label}</span>
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:240ms]" />
      </span>
    </div>
  )
}

type DraftPreviewProps = {
  readonly copy: string
  readonly disabled: boolean
  readonly onPublish: () => void
}

function DraftPreview({ copy, disabled, onPublish }: DraftPreviewProps) {
  return (
    <article className="grid max-w-[94%] gap-3 rounded-[22px] border border-[var(--line)] bg-white p-4 text-[var(--ink)] shadow-[0_18px_44px_-34px_rgba(25,23,32,0.7)]">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-[var(--accent)]">
            초안 준비 완료
          </p>
          <h2 className="text-base font-black leading-6">
            Google 비즈니스 프로필 게시글
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--mint-soft)] px-2.5 py-1 text-[11px] font-black text-[var(--ink)]">
          GBP
        </span>
      </header>
      <p className="rounded-2xl bg-[var(--phone-bg)] p-3 text-sm font-bold leading-6">
        {copy}
      </p>
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-black text-[var(--muted)]">
        <span className="rounded-full border border-[var(--line)] px-2.5 py-1">
          브런치모먼트 홍대점
        </span>
        <span className="rounded-full border border-[var(--line)] px-2.5 py-1">
          DRAFT_READY
        </span>
      </div>
      <ActionChip
        disabled={disabled}
        label="GBP 게시하기"
        onClick={onPublish}
      />
    </article>
  )
}

type FeedbackTone = "success" | "warning"

type ChatFeedbackProps = {
  readonly message: string
  readonly title: string
  readonly tone: FeedbackTone
}

function ChatFeedback({ message, title, tone }: ChatFeedbackProps) {
  const toneClasses =
    tone === "success"
      ? "border-[rgba(21,189,151,0.42)] bg-[var(--mint-soft)]"
      : "border-[rgba(255,106,61,0.38)] bg-[var(--accent-soft)]"

  return (
    <div
      className={`grid max-w-[94%] gap-1 rounded-[18px] border px-4 py-3 text-sm text-[var(--ink)] ${toneClasses}`}
      role="status"
    >
      <p className="text-xs font-black text-[var(--accent)]">{title}</p>
      <p className="font-bold leading-6">{message}</p>
    </div>
  )
}

export function AppWorkspace({ storeId }: AppWorkspaceProps) {
  const [activeNavId, setActiveNavId] = useState<AppNavId>("post")
  const [draft, setDraft] = useState<DraftState>({ kind: "idle" })
  const [intent, setIntent] = useState("주말 브런치 신메뉴 홍보")
  const [submittedIntent, setSubmittedIntent] = useState<string>()
  const [publish, setPublish] = useState<PublishState>({ kind: "idle" })

  function handleNavChange(navId: string) {
    if (navId === "home" || navId === "post" || navId === "insights") {
      setActiveNavId(navId)
    }
  }

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
        body: JSON.stringify({ storeId }),
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
    <main className="gx-route-page">
      <MobileShell
        bottomNav={
          <BottomNav
            activeId={activeNavId}
            items={appNavItems}
            onSelect={handleNavChange}
          />
        }
        testId="app-stage"
        topBar={
          <>
            <div className="gx-app-identity">
              <div className="gx-app-avatar" aria-hidden="true">
                X
              </div>
              <div className="min-w-0">
                <b>GlocalX · 브런치모먼트 홍대점</b>
                <small>AI 마케팅 매니저 · 온라인</small>
              </div>
            </div>
            <div className="grid shrink-0 justify-items-end gap-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-[11px] font-black text-[var(--ink)]">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-[var(--mint)]"
                />
                GBP
              </span>
              <span className="rounded-full bg-[var(--mint-soft)] px-2.5 py-1 text-[11px] font-black text-[var(--ink)]">
                연결됨
              </span>
            </div>
          </>
        }
      >
        <section className="flex min-h-full flex-col gap-4">
          <div className="grid gap-2">
            <p className="text-xs font-black text-[var(--accent)]">
              GBP 포스팅 채팅
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
              message="브런치모먼트 홍대점의 Google 비즈니스 프로필에 올릴 글을 준비할게요. 홍보 의도를 남기면 초안과 게시 상태를 여기서 바로 확인할 수 있습니다."
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
              홍보 의도
              <textarea
                className="min-h-24 resize-none rounded-2xl border border-[var(--line)] bg-[var(--phone-bg)] px-4 py-3 text-sm font-bold leading-6 outline-none focus:border-[var(--accent)]"
                onChange={(event) => setIntent(event.currentTarget.value)}
                value={intent}
              />
            </label>
            <div className="grid grid-cols-[1fr_auto] items-center gap-3">
              <div className="min-w-0 text-[11px] font-bold leading-4 text-[var(--muted)]">
                <p className="truncate">채널 GBP · 매장 브런치모먼트 홍대점</p>
                <p className="truncate">AI 마케팅 매니저가 초안을 작성합니다</p>
              </div>
              <div className="w-36">
                <ActionChip
                  buttonType="submit"
                  disabled={
                    draft.kind === "loading" || publish.kind === "loading"
                  }
                  label="GBP 초안 만들기"
                />
              </div>
            </div>
          </form>
        </section>
      </MobileShell>
    </main>
  )
}
