"use client"

import { useState, type FormEvent } from "react"

import { ChatMessage } from "@/app/_components/chat-message"
import { isRecord, readString, readStringArray } from "@/app/_components/json-value"
import { PhoneFrame } from "@/app/_components/phone-frame"
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

export function OnboardingFlow() {
  const [extraction, setExtraction] = useState<ExtractionState>({ kind: "idle" })
  const [input, setInput] = useState("https://naver.me/mybrunchcafe")
  const [setup, setSetup] = useState<SetupState>({ kind: "idle" })

  async function handleExtraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setExtraction({ kind: "loading" })
    setSetup({ kind: "idle" })

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
          error instanceof Error ? error.message : "가게 정보 조회에 실패했습니다.",
      })
    }
  }

  async function handleSetup() {
    setSetup({ kind: "loading" })

    try {
      const response = await fetch("/api/gbp/setup", {
        body: JSON.stringify({ mode: "stub", storeId: "demo-store" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      setSetup(toSetupState(payload))
    } catch (error) {
      setSetup({
        kind: "error",
        message:
          error instanceof Error ? error.message : "GBP 세팅 확인에 실패했습니다.",
      })
    }
  }

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-center">
        <div className="grid gap-6">
          <div className="flex items-center gap-4">
            <div className="gx-brand-mark">X</div>
            <div>
              <p className="text-sm font-black text-[var(--accent)]">GlocalX</p>
              <h1 className="text-3xl font-black text-white sm:text-5xl">
                가게 정보를 설정해드릴게요
              </h1>
            </div>
          </div>
          <p className="max-w-2xl text-base font-semibold leading-7 text-white/62">
            네이버 정보 추출과 Google Business Profile 세팅 결과를 확인한 뒤
            대시보드로 이동합니다.
          </p>
        </div>

        <PhoneFrame>
          <ChatMessage
            message="네이버 플레이스 링크나 가게 이름을 알려주세요."
            speaker="assistant"
          />
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
              {extraction.kind === "loading" ? "제출 중" : "네이버 정보 제출"}
            </button>
          </form>

          {extraction.kind === "candidate" ? (
            <div className="grid gap-3">
              <StatusCard label="상호명" status="success" value={extraction.name} />
              <StatusCard label="주소" value={extraction.address} />
              <StatusCard label="업종" value={extraction.category} />
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
                {setup.kind === "loading" ? "확인 중" : "다음: GBP 세팅 확인"}
              </button>
            </div>
          ) : null}

          {extraction.kind === "manual" ? (
            <p className="gx-inline-feedback text-sm font-bold">
              {extraction.message}
            </p>
          ) : null}
          {extraction.kind === "error" ? (
            <p className="gx-inline-feedback text-sm font-bold">
              {extraction.message}
            </p>
          ) : null}

          {setup.kind === "ready" ? (
            <form action="/api/onboarding/complete" className="grid gap-3" method="post">
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
          ) : null}
          {setup.kind === "error" ? (
            <p className="gx-inline-feedback text-sm font-bold">{setup.message}</p>
          ) : null}
        </PhoneFrame>
      </section>
    </main>
  )
}
