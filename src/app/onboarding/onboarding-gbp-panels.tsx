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
  onConfirmCreate,
  onRetry,
  setup,
}: {
  readonly onConfirmCreate?: ((reviewToken: string) => void) | undefined
  readonly onRetry?: (() => void) | undefined
  readonly setup: SetupState
}) {
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
      {setup.kind === "existingLocation" ? (
        <div className="grid gap-3" role="alert">
          <ChatMessage message={setup.message} speaker="assistant" />
          <StatusCard
            label="기존 GBP 후보"
            status="warning"
            value={setup.googleLocationId}
          />
          {setup.requestAdminRightsUrl === undefined ? null : (
            <a
              className="gx-onboarding-primary text-center"
              href={setup.requestAdminRightsUrl}
              rel="noreferrer"
              target="_blank"
            >
              Google에서 소유권 확인하기
            </a>
          )}
        </div>
      ) : null}
      {setup.kind === "googleOAuthRequired" ? (
        <div className="grid gap-3">
          <ChatMessage message={setup.message} speaker="assistant" />
          <form action="/api/auth/google/start" method="post">
            <input name="intent" type="hidden" value="gbp" />
            <button className="gx-onboarding-primary" type="submit">
              Google 계정 연결하기
            </button>
          </form>
        </div>
      ) : null}
      {setup.kind === "reviewRequired" ? (
        <div className="grid gap-3">
          <ChatMessage message={setup.message} speaker="assistant" />
          <StatusCard label="Google 계정" value={setup.accountDisplayName} />
          <StatusCard label="Google 계정 리소스" value={setup.accountName} />
          <StatusCard label="매장명" value={setup.businessName} />
          <StatusCard label="주소" value={setup.address} />
          <StatusCard label="전화번호" value={setup.phone} />
          <StatusCard label="업종" value={setup.categoryDisplayName} />
          <StatusCard label="Google 업종 리소스" value={setup.categoryName} />
          <StatusCard label="언어 코드" value={setup.languageCode} />
          <StatusCard label="매장 코드" value={setup.storeCode} />
          {onConfirmCreate === undefined ? null : (
            <button
              className="gx-onboarding-primary"
              onClick={() => onConfirmCreate(setup.reviewToken)}
              type="button"
            >
              매장형 비즈니스로 GBP 등록 승인
            </button>
          )}
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
            {setup.followUpJobId === undefined ? null : (
              <StatusCard label="후속 작업" value={setup.followUpJobId} />
            )}
            <button className="gx-onboarding-primary" type="submit">
              매장 홍보 처음 시키러 가기
            </button>
          </form>
        </div>
      ) : null}
      {setup.kind === "error" ? (
        <div className="grid gap-3" role="alert">
          <ChatMessage message={setup.message} speaker="assistant" />
          {onRetry === undefined ? null : (
            <button
              className="gx-onboarding-primary"
              onClick={onRetry}
              type="button"
            >
              GBP 세팅 다시 시도
            </button>
          )}
        </div>
      ) : null}
    </>
  )
}
