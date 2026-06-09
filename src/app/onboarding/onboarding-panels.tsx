"use client"

import { ChatMessage } from "@/app/_components/chat-message"
import { StatusCard } from "@/app/_components/status-card"

import {
  CandidatePicker,
  StatusPill,
  StoreInfoCard,
  StoreProfileConfirmForm,
  TypingIndicator,
  type StoreProfileField,
} from "./onboarding-components"
import type {
  ConfirmationState,
  ExtractionState,
  SetupState,
  StoreProfileDraft,
} from "./onboarding-model"

export function OnboardingTopBar() {
  return (
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
  )
}

export function OnboardingIntro() {
  return (
    <section aria-label="온보딩 대화" className="grid gap-3">
      <ChatMessage
        message="네이버 플레이스 링크나 가게 이름을 알려주세요."
        speaker="assistant"
      />
      <div aria-label="온보딩 진행 정보" className="flex flex-wrap gap-2">
        <StatusPill>네이버 정보 확인</StatusPill>
        <StatusPill>매장 프로필 확인</StatusPill>
        <StatusPill>GBP 세팅 점검</StatusPill>
      </div>
    </section>
  )
}

export function ExtractionPanel({
  extraction,
  onCandidateSelect,
  profileDraft,
  submittedInput,
}: {
  readonly extraction: ExtractionState
  readonly onCandidateSelect: (candidate: StoreProfileDraft) => void
  readonly profileDraft: StoreProfileDraft | undefined
  readonly submittedInput: string
}) {
  return (
    <>
      {submittedInput && extraction.kind !== "idle" ? (
        <ChatMessage message={submittedInput} speaker="owner" />
      ) : null}
      {extraction.kind === "loading" ? (
        <TypingIndicator label="네이버 정보를 확인하는 중" />
      ) : null}
      {extraction.kind === "searchQueryRequired" ? (
        <ChatMessage message={extraction.message} speaker="assistant" />
      ) : null}
      {extraction.kind === "manual" ? (
        <ChatMessage message={extraction.message} speaker="assistant" />
      ) : null}
      {extraction.kind === "candidates" && profileDraft !== undefined ? (
        <div className="grid gap-3">
          <ChatMessage message={extraction.message} speaker="assistant" />
          <div aria-label="추출 결과 상태" className="flex flex-wrap gap-2">
            <StatusPill>후보 {extraction.candidates.length}개</StatusPill>
            <StatusPill>상호·주소 확인</StatusPill>
            <StatusPill>
              {profileDraft.missingFields.includes("hours")
                ? "영업시간 필요"
                : "필수 정보 확인"}
            </StatusPill>
          </div>
          <CandidatePicker
            candidates={extraction.candidates}
            onSelect={onCandidateSelect}
            selectedCandidateId={profileDraft.candidateId}
          />
          <StoreInfoCard draft={profileDraft} />
        </div>
      ) : null}
      {extraction.kind === "error" ? (
        <div role="alert">
          <ChatMessage message={extraction.message} speaker="assistant" />
        </div>
      ) : null}
    </>
  )
}

export function ConfirmationPanel({
  confirmation,
  onConfirm,
  onFieldChange,
  onSetup,
  profileDraft,
  setup,
}: {
  readonly confirmation: ConfirmationState
  readonly onConfirm: () => void
  readonly onFieldChange: (field: StoreProfileField, value: string) => void
  readonly onSetup: () => void
  readonly profileDraft: StoreProfileDraft | undefined
  readonly setup: SetupState
}) {
  return (
    <>
      {profileDraft !== undefined ? (
        <StoreProfileConfirmForm
          disabled={confirmation.kind === "loading"}
          draft={profileDraft}
          onChange={onFieldChange}
          onConfirm={onConfirm}
        />
      ) : null}
      {confirmation.kind === "loading" ? (
        <TypingIndicator label="매장 정보를 확인하는 중" />
      ) : null}
      {confirmation.kind === "confirmed" ? (
        <div className="grid gap-3">
          <ChatMessage message={confirmation.message} speaker="assistant" />
          <StatusCard label="확인 기록" value={confirmation.extractionId} />
          <button
            className="gx-onboarding-primary"
            disabled={setup.kind === "loading"}
            onClick={onSetup}
            type="button"
          >
            다음: GBP 세팅 확인
          </button>
        </div>
      ) : null}
      {confirmation.kind === "error" ? (
        <div role="alert">
          <ChatMessage message={confirmation.message} speaker="assistant" />
        </div>
      ) : null}
    </>
  )
}

export function SetupPanel({ setup }: { readonly setup: SetupState }) {
  return (
    <>
      {setup.kind === "loading" ? (
        <TypingIndicator label="GBP 세팅을 확인하는 중" />
      ) : null}
      {setup.kind === "claimRequired" ? (
        <div className="grid gap-3">
          <ChatMessage message={setup.message} speaker="assistant" />
          <StatusCard
            label={setup.apiStatus}
            status="warning"
            value={setup.requestAdminRightsUrl}
          />
        </div>
      ) : null}
      {setup.kind === "ready" ? (
        <div className="grid gap-3">
          <ChatMessage message={setup.message} speaker="assistant" />
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
    </>
  )
}
