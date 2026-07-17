"use client"

import { ActionChip } from "@/app/_components/action-chip"

type TypingIndicatorProps = {
  readonly label: string
}

type DraftPreviewProps = {
  readonly copy: string
  readonly disabled: boolean
  readonly onPublish: () => void
}

type FeedbackTone = "success" | "warning"

type ChatFeedbackProps = {
  readonly message: string
  readonly title: string
  readonly tone: FeedbackTone
}

export function TypingIndicator({ label }: TypingIndicatorProps) {
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

export function DraftPreview({ copy, disabled, onPublish }: DraftPreviewProps) {
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

export function ChatFeedback({ message, title, tone }: ChatFeedbackProps) {
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
