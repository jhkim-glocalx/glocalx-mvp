import { ChatMessage } from "@/app/_components/chat-message"

import { InstagramConnectPanel } from "./onboarding-instagram-panels"
import { StatusPill } from "./onboarding-components"

/**
 * The screen an owner lands on when they reload onboarding partway through an
 * adoption.
 *
 * Terminal screens rather than a re-entry into the chat: the chat replays the
 * whole Naver extraction from the top, and asking an owner to re-enter a store
 * we have already confirmed — to reach a decision an operator has already made —
 * is the failure this exists to prevent. Same shape as the Instagram connect
 * result screen, which solves the same reload problem for the same reason.
 */
export function AdoptionReviewingPanel() {
  return (
    <div className="grid gap-3">
      <ChatMessage
        message="등록된 프로필인지 담당자가 확인하고 있어요. 확인이 끝나면 알려드릴게요."
        speaker="assistant"
      />
      <ChatMessage
        message="이 화면은 닫으셔도 괜찮아요. 다시 들어오시면 진행 상황을 보여드릴게요."
        speaker="assistant"
      />
    </div>
  )
}

export function GbpConnectedResumePanel() {
  return (
    <div className="grid gap-3">
      <ChatMessage
        message="Google 비즈니스 프로필이 연결됐어요. 이제 홍보를 시작할 수 있어요."
        speaker="assistant"
      />
      <div aria-label="GBP 세팅 상태" className="flex flex-wrap gap-2">
        <StatusPill>GBP 연결 확인</StatusPill>
      </div>
      {/* Hands off to the same last step the chat flow ends with, so resuming is
          not a way to skip the Instagram question. */}
      <InstagramConnectPanel />
    </div>
  )
}
