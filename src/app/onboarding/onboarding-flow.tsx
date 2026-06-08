"use client"

import { useState, type FormEvent } from "react"

import { ChatMessage } from "@/app/_components/chat-message"
import {
  isRecord,
  readString,
  readStringArray,
} from "@/app/_components/json-value"
import { MobileShell } from "@/app/_components/mobile-shell"
import { StatusCard } from "@/app/_components/status-card"

type ExtractionState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly address: string
      readonly category: string
      readonly kind: "candidate"
      readonly missingFields: readonly string[]
      readonly name: string
    }
  | { readonly kind: "manual"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }

type SetupState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly apiStatus: string
      readonly auditLogId: string
      readonly followUpJobId: string
      readonly kind: "ready"
    }
  | { readonly kind: "error"; readonly message: string }

type ExtractionCandidate = Extract<
  ExtractionState,
  { readonly kind: "candidate" }
>

function toExtractionState(payload: unknown): ExtractionState {
  if (!isRecord(payload)) {
    return { kind: "error", message: "응답을 읽지 못했습니다." }
  }

  const status = readString(payload["status"])
  if (status === "MANUAL_INPUT_REQUIRED") {
    return {
      kind: "manual",
      message:
        readString(payload["message"]) ??
        "네이버에서 매장을 찾지 못했습니다. 직접 입력으로 계속할 수 있습니다.",
    }
  }

  const candidates = payload["candidates"]
  const firstCandidate = Array.isArray(candidates) ? candidates[0] : undefined
  if (status === "CANDIDATES_FOUND" && isRecord(firstCandidate)) {
    return {
      address: readString(firstCandidate["address"]) ?? "주소 확인 필요",
      category: readString(firstCandidate["category"]) ?? "업종 확인 필요",
      kind: "candidate",
      missingFields: readStringArray(firstCandidate["missingFields"]),
      name: readString(firstCandidate["name"]) ?? "매장명 확인 필요",
    }
  }

  return { kind: "error", message: "가게 정보를 찾지 못했습니다." }
}

function toSetupState(payload: unknown): SetupState {
  if (!isRecord(payload)) {
    return { kind: "error", message: "GBP 세팅 응답을 읽지 못했습니다." }
  }

  return {
    apiStatus: readString(payload["status"]) ?? "UNKNOWN",
    auditLogId: readString(payload["auditLogId"]) ?? "audit-id-missing",
    followUpJobId: readString(payload["followUpJobId"]) ?? "job-id-missing",
    kind: "ready",
  }
}

function StatusPill({ children }: { readonly children: string }) {
  return (
    <span className="rounded-full border border-[var(--line)] bg-white px-3 py-2 text-xs font-black text-[var(--ink-soft)] shadow-sm">
      {children}
    </span>
  )
}

function TypingIndicator({ label }: { readonly label: string }) {
  return (
    <div
      aria-live="polite"
      className="gx-bubble flex w-fit items-center gap-1.5"
      data-speaker="assistant"
      role="status"
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className="h-2 w-2 animate-pulse rounded-full bg-[var(--muted)]"
      />
      <span
        aria-hidden="true"
        className="h-2 w-2 animate-pulse rounded-full bg-[var(--muted)] [animation-delay:120ms]"
      />
      <span
        aria-hidden="true"
        className="h-2 w-2 animate-pulse rounded-full bg-[var(--muted)] [animation-delay:240ms]"
      />
    </div>
  )
}

function StoreInfoCard({
  extraction,
}: {
  readonly extraction: ExtractionCandidate
}) {
  return (
    <article className="gx-status-card" data-status="success">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-[var(--ink-soft)]">
          네이버 후보
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[var(--mint)]">
          자동 추출
        </span>
      </div>
      <strong className="text-xl leading-tight">{extraction.name}</strong>
      <dl className="grid gap-2 text-sm font-bold text-[var(--ink-soft)]">
        <div className="grid gap-1">
          <dt className="text-[11px] font-black uppercase text-[var(--muted)]">
            주소
          </dt>
          <dd>{extraction.address}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-[11px] font-black uppercase text-[var(--muted)]">
            업종
          </dt>
          <dd>{extraction.category}</dd>
        </div>
      </dl>
    </article>
  )
}

type OnboardingFlowProps = {
  readonly storeId: string
}

export function OnboardingFlow({ storeId }: OnboardingFlowProps) {
  const [extraction, setExtraction] = useState<ExtractionState>({
    kind: "idle",
  })
  const [input, setInput] = useState("https://naver.me/mybrunchcafe")
  const [setup, setSetup] = useState<SetupState>({ kind: "idle" })
  const [submittedInput, setSubmittedInput] = useState("")

  async function handleExtraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setExtraction({ kind: "loading" })
    setSetup({ kind: "idle" })
    setSubmittedInput(input)

    try {
      const response = await fetch("/api/onboarding/extractions", {
        body: JSON.stringify({ input }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      setExtraction(toExtractionState(payload))
    } catch (error) {
      setExtraction({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "가게 정보 조회에 실패했습니다.",
      })
    }
  }

  async function handleSetup() {
    setSetup({ kind: "loading" })

    try {
      const response = await fetch("/api/gbp/setup", {
        body: JSON.stringify({ mode: "stub", storeId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      setSetup(toSetupState(payload))
    } catch (error) {
      setSetup({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "GBP 세팅 확인에 실패했습니다.",
      })
    }
  }

  return (
    <main className="gx-route-page">
      <MobileShell
        topBar={
          <>
            <div className="flex min-w-0 items-center gap-3">
              <div className="gx-brand-mark" aria-hidden="true">
                X
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-black text-[var(--ink)]">
                  글로컬엑스
                </p>
                <p className="truncate text-xs font-black text-[var(--mint)]">
                  AI 마케팅 매니저 · 온라인
                </p>
              </div>
            </div>
            <span
              aria-label="더보기"
              className="grid h-10 w-10 flex-none place-items-center rounded-full text-lg font-black text-[var(--ink-soft)]"
              role="img"
            >
              ···
            </span>
          </>
        }
      >
        <section aria-label="온보딩 대화" className="grid gap-3">
          <ChatMessage
            message="네이버 플레이스 링크나 가게 이름을 알려주세요."
            speaker="assistant"
          />
          <div aria-label="온보딩 진행 정보" className="flex flex-wrap gap-2">
            <StatusPill>네이버 정보 확인</StatusPill>
            <StatusPill>매장 프로필 추출</StatusPill>
            <StatusPill>GBP 세팅 점검</StatusPill>
          </div>
        </section>

        <form className="gx-onboarding-form" onSubmit={handleExtraction}>
          <label className="grid gap-2 text-sm font-black text-[var(--ink)]">
            네이버 정보
            <input
              className="gx-onboarding-input"
              onChange={(event) => setInput(event.currentTarget.value)}
              placeholder="https://naver.me/mybrunchcafe"
              type="text"
              value={input}
            />
          </label>
          <button
            className="gx-onboarding-primary"
            disabled={extraction.kind === "loading"}
            type="submit"
          >
            네이버 정보 제출
          </button>
        </form>

        {submittedInput && extraction.kind !== "idle" ? (
          <ChatMessage message={submittedInput} speaker="owner" />
        ) : null}

        {extraction.kind === "loading" ? (
          <TypingIndicator label="네이버 정보를 확인하는 중" />
        ) : null}

        {extraction.kind === "candidate" ? (
          <div className="grid gap-3">
            <ChatMessage
              message="네이버에서 매장 후보를 찾았어요. 빠진 정보만 확인하고 GBP 세팅으로 넘어갈게요."
              speaker="assistant"
            />
            <div aria-label="추출 결과 상태" className="flex flex-wrap gap-2">
              <StatusPill>후보 1개</StatusPill>
              <StatusPill>상호·주소 확인</StatusPill>
              <StatusPill>
                {extraction.missingFields.includes("hours")
                  ? "영업시간 필요"
                  : "필수 정보 확인"}
              </StatusPill>
            </div>
            <StoreInfoCard extraction={extraction} />
            {extraction.missingFields.includes("hours") ? (
              <StatusCard
                label="영업시간"
                status="warning"
                value="영업시간 입력 필요"
              />
            ) : null}
            <button
              className="gx-onboarding-primary"
              disabled={setup.kind === "loading"}
              onClick={handleSetup}
              type="button"
            >
              다음: GBP 세팅 확인
            </button>
          </div>
        ) : null}

        {extraction.kind === "manual" ? (
          <ChatMessage message={extraction.message} speaker="assistant" />
        ) : null}
        {extraction.kind === "error" ? (
          <div role="alert">
            <ChatMessage message={extraction.message} speaker="assistant" />
          </div>
        ) : null}

        {setup.kind === "loading" ? (
          <TypingIndicator label="GBP 세팅을 확인하는 중" />
        ) : null}

        {setup.kind === "ready" ? (
          <div className="grid gap-3">
            <ChatMessage
              message="GBP 세팅 상태를 확인했어요. 대시보드에서 다음 작업을 이어갈 수 있어요."
              speaker="assistant"
            />
            <div aria-label="GBP 세팅 상태" className="flex flex-wrap gap-2">
              <StatusPill>GBP 연결 확인</StatusPill>
              <StatusPill>후속 작업 예약</StatusPill>
            </div>
            <form
              action="/api/onboarding/complete"
              className="grid gap-3"
              method="post"
            >
              <StatusCard
                label={setup.apiStatus}
                status="warning"
                value="인증 대기"
              />
              <StatusCard label="감사 기록" value={setup.auditLogId} />
              <StatusCard label="후속 작업" value={setup.followUpJobId} />
              <button className="gx-onboarding-primary" type="submit">
                대시보드로 이동
              </button>
            </form>
          </div>
        ) : null}
        {setup.kind === "error" ? (
          <div role="alert">
            <ChatMessage message={setup.message} speaker="assistant" />
          </div>
        ) : null}
      </MobileShell>
    </main>
  )
}
