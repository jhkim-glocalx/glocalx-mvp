"use client"

import { ChatMessage } from "@/app/_components/chat-message"

import {
  CandidatePicker,
  StatusPill,
  StoreInfoCard,
  TypingIndicator,
} from "./onboarding-components"
import type {
  ExtractionState,
  OnboardingChatTurn,
  OnboardingSlotTurnState,
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
      <span aria-label="더보기" className="gx-app-menu" role="img">
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
      <div className="gx-chat-divider">
        STEP 1 · 온보딩 / 구글비즈니스프로필 세팅
      </div>
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
  onCandidateSearchAgain,
  onCandidateSelect,
  profileDraft,
  submittedInput,
}: {
  readonly extraction: ExtractionState
  readonly onCandidateSearchAgain: () => void
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
      {extraction.kind === "candidates" ? (
        <div className="grid gap-3">
          <ChatMessage message={extraction.message} speaker="assistant" />
          <div aria-label="추출 결과 상태" className="flex flex-wrap gap-2">
            <StatusPill>후보 {extraction.candidates.length}개</StatusPill>
            <StatusPill>
              {profileDraft === undefined
                ? extraction.candidates.length === 1
                  ? "매장 확인 필요"
                  : "선택 필요"
                : "상호·주소 확인"}
            </StatusPill>
            {profileDraft === undefined ? null : (
              <StatusPill>
                {profileDraft.missingFields.includes("hours")
                  ? "영업시간 필요"
                  : "필수 정보 확인"}
              </StatusPill>
            )}
          </div>
          <CandidatePicker
            candidates={extraction.candidates}
            onSelect={onCandidateSelect}
            selectedCandidateId={profileDraft?.candidateId}
          />
          <SingleCandidateConfirmation
            candidates={extraction.candidates}
            onConfirm={onCandidateSelect}
            onSearchAgain={onCandidateSearchAgain}
            profileDraft={profileDraft}
          />
          {profileDraft === undefined ? null : (
            <StoreInfoCard draft={profileDraft} />
          )}
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

function SingleCandidateConfirmation({
  candidates,
  onConfirm,
  onSearchAgain,
  profileDraft,
}: {
  readonly candidates: readonly StoreProfileDraft[]
  readonly onConfirm: (candidate: StoreProfileDraft) => void
  readonly onSearchAgain: () => void
  readonly profileDraft: StoreProfileDraft | undefined
}) {
  if (profileDraft !== undefined || candidates.length !== 1) {
    return null
  }

  const candidate = candidates[0]
  if (candidate === undefined) {
    return null
  }

  return (
    <div className="grid gap-3">
      <StoreInfoCard draft={candidate} />
      <ChatMessage
        message="검색된 매장이 맞나요? 맞으면 확인하고, 아니면 다시 검색해주세요."
        speaker="assistant"
      />
      <div aria-label="검색된 매장 확인" className="gx-actions-row">
        <button
          className="gx-choice-chip"
          onClick={() => onConfirm(candidate)}
          type="button"
        >
          매장 확인
        </button>
        <button
          className="gx-choice-chip"
          data-tone="ghost"
          onClick={onSearchAgain}
          type="button"
        >
          다시 검색
        </button>
      </div>
    </div>
  )
}

function missingFieldCopy(missingFields: readonly string[]): string {
  const needsPhone = missingFields.includes("phone")
  const needsHours = missingFields.includes("hours")
  if (needsPhone) {
    return "매장 정보를 찾았어요. 먼저 전화번호를 알려주세요. 예: 010-1234-5678. 위 양식에 직접 입력해도 됩니다."
  }
  if (needsHours) {
    return "영업시간을 알려주세요. 예: 평일 오후 6시부터 10시까지. 위 양식에 직접 입력해도 됩니다."
  }
  return "입력해주신 정보를 양식에 채웠어요. 틀린 곳이 있으면 고치고, 맞으면 매장 정보 확인을 눌러주세요."
}

export function SlotCollectionPanel({
  profileDraft,
  slotMessages,
  slotState,
}: {
  readonly profileDraft: StoreProfileDraft | undefined
  readonly slotMessages: readonly OnboardingChatTurn[]
  readonly slotState: OnboardingSlotTurnState
}) {
  if (profileDraft === undefined || profileDraft.source === "MANUAL") {
    return null
  }

  return (
    <div className="grid gap-3">
      {profileDraft.missingFields.length > 0 && slotMessages.length === 0 ? (
        <ChatMessage
          message={missingFieldCopy(profileDraft.missingFields)}
          speaker="assistant"
        />
      ) : null}
      {slotMessages.map((turn) => (
        <ChatMessage
          key={turn.id}
          message={turn.message}
          speaker={turn.speaker}
        />
      ))}
      {slotState.kind === "loading" ? (
        <TypingIndicator label="답변에서 매장 정보를 확인하는 중" />
      ) : null}
      {slotState.kind === "error" ? (
        <div role="alert">
          <ChatMessage message={slotState.message} speaker="assistant" />
        </div>
      ) : null}
    </div>
  )
}
