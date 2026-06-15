"use client"

import { ChatMessage } from "@/app/_components/chat-message"
import { StatusCard } from "@/app/_components/status-card"

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

  return (
    <StoreProfileConfirmForm
      disabled={
        confirmation.kind === "loading" || profileDraft.missingFields.length > 0
      }
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
