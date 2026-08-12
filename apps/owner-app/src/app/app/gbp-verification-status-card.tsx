"use client"

import type { GbpVerificationOwnerPhase } from "@glocalx/domain/gbp-verification-state"

import type { OwnerGbpVerification } from "./use-gbp-verification"

// Owner-facing copy per coarse phase. The owner never sees the five internal
// verification states — only "we're on it", "verified", or "a person will help".
// Under Model A the operator drives the concierge (video) verification, so the
// "attention" copy reassures rather than handing the owner a task, and still
// offers chat as the escape hatch.
const phaseCopy: Readonly<
  Record<GbpVerificationOwnerPhase, { title: string; body: string }>
> = {
  in_progress: {
    title: "구글 인증을 진행하고 있어요",
    body: "구글 비즈니스 프로필 인증을 진행하고 있어요. 완료되면 알려드릴게요.",
  },
  verified: {
    title: "구글 인증이 완료됐어요",
    body: "구글 비즈니스 프로필 인증이 완료되어 매장이 검색에 정상 노출돼요.",
  },
  attention: {
    title: "인증에 도움이 필요해요",
    body: "구글 인증에 담당자의 도움이 필요해요. 확인 후 연락드릴게요.",
  },
}

export function GbpVerificationStatusCard({
  verification,
  onContactSupport,
}: {
  readonly verification: OwnerGbpVerification | null
  readonly onContactSupport: () => void
}) {
  if (verification === null) {
    return null
  }

  const copy = phaseCopy[verification.phase]
  return (
    <div
      className={`gx-gbp-verification-card gx-gbp-verification-card-${verification.phase}`}
      data-phase={verification.phase}
      data-state={verification.state}
      data-testid="gbp-verification-card"
    >
      <strong>{copy.title}</strong>
      <p>{copy.body}</p>
      {verification.phase === "attention" ? (
        <button
          className="gx-onboarding-primary"
          data-testid="gbp-verification-contact"
          onClick={onContactSupport}
          type="button"
        >
          채팅으로 문의하기
        </button>
      ) : null}
    </div>
  )
}
