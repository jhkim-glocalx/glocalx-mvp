"use client"

import { ChatMessage } from "@/app/_components/chat-message"
import { StatusCard } from "@/app/_components/status-card"

import { CategoryPicker } from "./category-picker"
import { InstagramConnectPanel } from "./onboarding-instagram-panels"
import {
  StatusPill,
  StoreProfileConfirmForm,
  TypingIndicator,
  type StoreProfileField,
} from "./onboarding-components"
import type {
  ConfirmationState,
  SetupState,
  StoreProfileDraft,
} from "./onboarding-model"

export function StoreProfileFormPanel({
  confirmation,
  onConfirm,
  onFieldChange,
  profileDraft,
}: {
  readonly confirmation: ConfirmationState
  readonly onConfirm: () => void
  readonly onFieldChange: (field: StoreProfileField, value: string) => void
  readonly profileDraft: StoreProfileDraft | undefined
}) {
  if (profileDraft === undefined) {
    return null
  }

  if (
    profileDraft.source !== "MANUAL" &&
    profileDraft.missingFields.length > 0
  ) {
    return null
  }

  return (
    <StoreProfileConfirmForm
      disabled={confirmation.kind === "loading"}
      draft={profileDraft}
      onChange={onFieldChange}
      onConfirm={onConfirm}
    />
  )
}

export function GbpHandoffPanel({
  confirmation,
  onSetup,
  setup,
}: {
  readonly confirmation: ConfirmationState
  readonly onSetup: () => void
  readonly setup: SetupState
}) {
  return (
    <>
      {confirmation.kind === "loading" ? (
        <TypingIndicator label="매장 정보를 확인하는 중" />
      ) : null}
      {confirmation.kind === "confirmed" ? (
        <div className="grid gap-3">
          <ChatMessage message={confirmation.message} speaker="assistant" />
          <StatusCard label="확인 기록" value={confirmation.extractionId} />
          <CategoryPicker />
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

export function SetupPanel({
  onRetry,
  setup,
}: {
  readonly onRetry: () => void
  readonly setup: SetupState
}) {
  return (
    <>
      {setup.kind === "loading" ? (
        <TypingIndicator label="GBP 세팅을 확인하는 중" />
      ) : null}
      {setup.kind === "categoryRequired" ? (
        <div className="grid gap-3">
          <div role="alert">
            <ChatMessage message={setup.message} speaker="assistant" />
          </div>
          <CategoryPicker />
          <button
            className="gx-onboarding-primary"
            onClick={onRetry}
            type="button"
          >
            카테고리 선택 후 다시 시도
          </button>
        </div>
      ) : null}
      {setup.kind === "addressUnresolved" ? (
        <div className="grid gap-3">
          <div role="alert">
            <ChatMessage message={setup.message} speaker="assistant" />
          </div>
          <StatusCard
            label="주소 확인 필요"
            status="warning"
            value="매장 정보의 주소를 다시 확인해주세요"
          />
        </div>
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
            {setup.followUpJobId === undefined ? null : (
              <StatusPill>후속 작업 예약</StatusPill>
            )}
          </div>
          <StatusCard
            label={setup.apiStatus}
            status="warning"
            value="인증 대기"
          />
          <StatusCard label="감사 기록" value={setup.auditLogId} />
          {setup.followUpJobId === undefined ? null : (
            <StatusCard label="후속 작업" value={setup.followUpJobId} />
          )}
          {/* GBP is done; the Instagram question is the last onboarding step and
              owns the "finish onboarding" action, so an owner cannot skip past
              it without answering. */}
          <InstagramConnectPanel />
        </div>
      ) : null}
      {setup.kind === "retryable" ? (
        <div className="grid gap-3">
          <div role="alert">
            <ChatMessage message={setup.message} speaker="assistant" />
          </div>
          <button
            className="gx-onboarding-primary"
            onClick={onRetry}
            type="button"
          >
            다시 시도
          </button>
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
