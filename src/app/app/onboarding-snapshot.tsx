"use client"

import type { ReactNode } from "react"

import { ChatMessage } from "@/app/_components/chat-message"
import type { StoreProfileField } from "@/app/onboarding/onboarding-components"
import {
  dummyNaverPlaceUrl,
  dummyStoreName,
} from "@/app/onboarding/onboarding-dummy-inputs"
import {
  GbpHandoffPanel,
  SetupPanel,
  StoreProfileFormPanel,
} from "@/app/onboarding/onboarding-gbp-panels"
import {
  ExtractionPanel,
  SlotCollectionPanel,
} from "@/app/onboarding/onboarding-panels"
import type {
  ConfirmationState,
  ExtractionState,
  OnboardingChatTurn,
  OnboardingSlotTurnState,
  SetupState,
  StoreProfileDraft,
} from "@/app/onboarding/onboarding-model"

type OnboardingSnapshotProps = {
  readonly confirmation: ConfirmationState
  readonly extraction: ExtractionState
  readonly onCandidateSearchAgain: () => void
  readonly onCandidateSelect: (candidate: StoreProfileDraft) => void
  readonly onConfirm: () => void
  readonly onFieldChange: (field: StoreProfileField, value: string) => void
  readonly onComposerPreset: (message: string) => void
  readonly onSetup: () => void
  readonly profileDraft: StoreProfileDraft | undefined
  readonly setup: SetupState
  readonly slotMessages: readonly OnboardingChatTurn[]
  readonly slotState: OnboardingSlotTurnState
  readonly submittedInput: string
}

function ChatDivider({ children }: { readonly children: ReactNode }) {
  return <div className="gx-chat-divider">{children}</div>
}

function OnboardingChoiceButton({
  children,
  onClick,
  tone = "primary",
}: {
  readonly children: ReactNode
  readonly onClick: () => void
  readonly tone?: "primary" | "ghost"
}) {
  return (
    <button
      className="gx-choice-chip"
      data-tone={tone}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

export function OnboardingSnapshot({
  confirmation,
  extraction,
  onCandidateSearchAgain,
  onCandidateSelect,
  onConfirm,
  onFieldChange,
  onComposerPreset,
  onSetup,
  profileDraft,
  setup,
  slotMessages,
  slotState,
  submittedInput,
}: OnboardingSnapshotProps) {
  return (
    <>
      <ChatDivider>STEP 1 · 온보딩 / 구글비즈니스프로필 세팅</ChatDivider>
      <ChatMessage
        message="저는 우리 매장을 외국인들에게 알릴 AI 홍보 직원이에요, 먼저 매장의 정보를 등록할께요. 네이버플레이스 링크나 상호명을 알려주세요"
        speaker="assistant"
      />
      <div className="gx-actions-row">
        <OnboardingChoiceButton
          onClick={() => onComposerPreset(dummyNaverPlaceUrl)}
        >
          네이버플레이스 링크 붙여넣기
        </OnboardingChoiceButton>
        <OnboardingChoiceButton
          onClick={() => onComposerPreset(dummyStoreName)}
          tone="ghost"
        >
          상호명으로 검색
        </OnboardingChoiceButton>
      </div>
      <ExtractionPanel
        extraction={extraction}
        onCandidateSearchAgain={onCandidateSearchAgain}
        onCandidateSelect={onCandidateSelect}
        profileDraft={profileDraft}
        submittedInput={submittedInput}
      />
      <StoreProfileFormPanel
        confirmation={confirmation}
        onConfirm={onConfirm}
        onFieldChange={onFieldChange}
        profileDraft={profileDraft}
      />
      <SlotCollectionPanel
        profileDraft={profileDraft}
        slotMessages={slotMessages}
        slotState={slotState}
      />
      <GbpHandoffPanel
        confirmation={confirmation}
        onSetup={onSetup}
        setup={setup}
      />
      <SetupPanel setup={setup} />
    </>
  )
}
