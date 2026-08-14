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
  AdoptionState,
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

// The owner declares intent instead of the app inferring it. Without this the
// only path is "create", and for a store already listed on Google that produces
// a duplicate — the failure this whole branch exists to prevent.
export function ExistingListingPrompt({
  adoption,
  disabled,
  onClaimExisting,
}: {
  readonly adoption: AdoptionState
  readonly disabled: boolean
  readonly onClaimExisting: () => void
}) {
  if (adoption.kind === "loading") {
    return <TypingIndicator label="등록된 프로필을 확인하는 중" />
  }
  if (adoption.kind === "reviewing" || adoption.kind === "noMatch") {
    return (
      <div className="grid gap-3">
        <ChatMessage message={adoption.message} speaker="assistant" />
      </div>
    )
  }
  return (
    <div className="grid gap-3">
      {adoption.kind === "error" ? (
        <div role="alert">
          <ChatMessage message={adoption.message} speaker="assistant" />
        </div>
      ) : null}
      <ChatMessage
        message="이미 Google 비즈니스 프로필을 등록하셨나요?"
        speaker="assistant"
      />
      <button
        className="gx-onboarding-secondary"
        data-testid="gbp-claim-existing"
        disabled={disabled}
        onClick={onClaimExisting}
        type="button"
      >
        이미 등록했어요
      </button>
    </div>
  )
}

// onClaimExisting is optional so the read-only onboarding replay in the app
// workspace can render this panel without offering a branch it cannot drive; the
// prompt is hidden rather than shown as a dead button.
export function GbpHandoffPanel({
  adoption = { kind: "idle" },
  confirmation,
  onClaimExisting,
  onSetup,
  setup,
}: {
  readonly adoption?: AdoptionState
  readonly confirmation: ConfirmationState
  readonly onClaimExisting?: (() => void) | undefined
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
          {onClaimExisting === undefined ? null : (
            <ExistingListingPrompt
              adoption={adoption}
              disabled={adoption.kind === "loading" || setup.kind === "loading"}
              onClaimExisting={onClaimExisting}
            />
          )}
          {/* Creating is hidden once a claim is in review: offering it there is
              offering the owner the duplicate we just stopped. */}
          {adoption.kind === "reviewing" ? null : (
            <button
              className="gx-onboarding-primary"
              disabled={setup.kind === "loading" || adoption.kind === "loading"}
              onClick={onSetup}
              type="button"
            >
              다음: GBP 세팅 확인
            </button>
          )}
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
      {setup.kind === "alreadyLinked" ? (
        <div className="grid gap-3">
          <ChatMessage message={setup.message} speaker="assistant" />
          {/* An adopted store never reaches `ready`, so without this it would
              never reach the onboarding exit that `ready` leads to — the owner
              whose listing we attached by hand would sit here forever, which is
              the exact case adoption exists to serve. It hands off to the same
              Instagram step rather than exiting directly, so an adopted owner
              answers that question like everyone else. */}
          {setup.connected ? (
            <>
              <div aria-label="GBP 세팅 상태" className="flex flex-wrap gap-2">
                <StatusPill>GBP 연결 확인</StatusPill>
              </div>
              <InstagramConnectPanel />
            </>
          ) : null}
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
