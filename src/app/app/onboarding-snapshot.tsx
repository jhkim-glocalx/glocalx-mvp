"use client"

import type { ReactNode } from "react"

import { ChatMessage } from "@/app/_components/chat-message"
import type { StoreProfileField } from "@/app/onboarding/onboarding-components"
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
        message="안녕하세요 사장님! 👋 저는 가게의 글로벌 마케팅을 도와드릴 글로컬엑스예요. 먼저 가게를 등록할게요. 네이버 플레이스 링크나 가게 이름을 알려주시겠어요?"
        speaker="assistant"
      />
      <div className="gx-actions-row">
        <OnboardingChoiceButton
          onClick={() => onComposerPreset("https://naver.me/mybrunchcafe")}
        >
          네이버 플레이스 링크 붙여넣기
        </OnboardingChoiceButton>
        <OnboardingChoiceButton
          onClick={() => onComposerPreset("브런치모먼트")}
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
