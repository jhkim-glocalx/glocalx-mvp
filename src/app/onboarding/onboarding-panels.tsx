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
            <span aria-hidden="true" className="gx-online-dot" /> AI 마케팅
            매니저 · 온라인
          </p>
        </div>
      </div>
      <span
        aria-label="더보기"
        className="gx-app-menu"
        role="img"
      >
        ⋮
      </span>
    </>
  )
}

function QuickReplyButton({
  children,
  onClick,
}: {
  readonly children: string
  readonly onClick: () => void
}) {
  return (
    <button
      className="rounded-full border border-[var(--line)] bg-white px-3 py-2 text-xs font-black text-[var(--ink-soft)] shadow-sm"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

export function OnboardingIntro({
  onNaverLinkAttach,
  onStoreNameSearch,
}: {
  readonly onNaverLinkAttach: () => void
  readonly onStoreNameSearch: () => void
}) {
  return (
    <section aria-label="온보딩 대화" className="grid gap-3">
      <div className="gx-chat-divider">STEP 1 · 온보딩 / 구글비즈니스프로필 세팅</div>
      <ChatMessage
        message="안녕하세요 사장님! 👋 저는 가게의 글로벌 마케팅을 도와드릴 글로컬엑스예요. 먼저 가게를 등록할게요. 네이버 플레이스 링크나 가게 이름을 알려주시겠어요?"
        speaker="assistant"
      />
      <div aria-label="온보딩 빠른 답변" className="gx-chip-row">
        <QuickReplyButton onClick={onNaverLinkAttach}>
          네이버 플레이스 링크 붙여넣기
        </QuickReplyButton>
        <QuickReplyButton onClick={onStoreNameSearch}>
          상호명으로 검색
        </QuickReplyButton>
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
