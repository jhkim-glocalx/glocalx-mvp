"use client"

import type { GbpAccessOwnerPhase } from "@glocalx/domain/gbp-access"

import type { OwnerGbpAccess } from "./use-gbp-access"

// Owner-facing copy per coarse phase. The owner never sees the six operator
// states — only "we're on it", "done", or "let's talk" — so a stuck request is
// a prompt to chat, never a dead end.
const phaseCopy: Readonly<
  Record<GbpAccessOwnerPhase, { title: string; body: string }>
> = {
  in_progress: {
    title: "매니저 액세스 처리 중이에요",
    body: "구글 비즈니스 프로필 매니저 액세스를 준비하고 있어요. 완료되면 알려드릴게요.",
  },
  granted: {
    title: "매니저 액세스가 연결됐어요",
    body: "구글 비즈니스 프로필 매니저 액세스가 연결되어 홍보를 진행할 수 있어요.",
  },
  attention: {
    title: "확인이 필요해요",
    body: "매니저 액세스에 확인할 점이 있어요. 채팅으로 문의해 주세요.",
  },
}

export function GbpAccessStatusCard({
  access,
  onContactSupport,
}: {
  readonly access: OwnerGbpAccess | null
  readonly onContactSupport: () => void
}) {
  if (access === null) {
    return null
  }

  const copy = phaseCopy[access.phase]
  return (
    <div
      className={`gx-gbp-access-card gx-gbp-access-card-${access.phase}`}
      data-phase={access.phase}
      data-state={access.state}
      data-testid="gbp-access-card"
    >
      <strong>{copy.title}</strong>
      <p>{copy.body}</p>
      {access.phase === "attention" ? (
        <button
          className="gx-onboarding-primary"
          data-testid="gbp-access-contact"
          onClick={onContactSupport}
          type="button"
        >
          채팅으로 문의하기
        </button>
      ) : null}
    </div>
  )
}
