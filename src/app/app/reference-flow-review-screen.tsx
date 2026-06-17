"use client"

import { useState } from "react"

import { ChatMessage } from "@/app/_components/chat-message"

import { ChatDivider, ChoiceButton, FlowCard } from "./reference-flow-shared"

type ReviewReplyTone = "friendly" | "polite" | "witty"

type ReviewReplyDraft = {
  readonly copy: string
  readonly label: string
  readonly tone: ReviewReplyTone
}

const reviewReplyDrafts = {
  friendly: {
    copy: "따뜻한 리뷰 정말 감사합니다! 수플레 팬케이크와 편안한 분위기를 좋게 봐주셔서 기뻐요. 다음 방문 때도 맛있는 브런치로 기다릴게요.",
    label: "친근한 답글 초안",
    tone: "friendly",
  },
  polite: {
    copy: "소중한 리뷰를 남겨주셔서 감사합니다. 만족스러운 브런치 경험이 되었다니 기쁩니다. 다시 방문해주시면 더 좋은 서비스로 맞이하겠습니다.",
    label: "정중한 답글 초안",
    tone: "polite",
  },
  witty: {
    copy: "수플레 팬케이크가 좋은 기억으로 남았다니 정말 반갑습니다. 다음에도 폭신한 한 접시와 포근한 분위기로 기다리고 있겠습니다.",
    label: "위트있는 답글 초안",
    tone: "witty",
  },
} satisfies Record<ReviewReplyTone, ReviewReplyDraft>

export function ReviewsScreen() {
  const [replyDraft, setReplyDraft] = useState<ReviewReplyDraft | null>(null)
  const [showRiskGuide, setShowRiskGuide] = useState(false)

  return (
    <>
      <ChatDivider>STEP 4 · 리뷰 AI 관리</ChatDivider>
      <ChatMessage speaker="assistant">
        새 리뷰가 달렸어요! 구글비즈니스프로필에 영어 리뷰가 등록됐어요.
      </ChatMessage>
      <FlowCard title="리뷰 분석 & 답변 추천">
        <div className="gx-review-card">
          <span>★★★★★</span>
          <small>Google · 영어 리뷰</small>
          <p>
            &quot;Amazing soufflé pancake! The vibe was so cozy. Will definitely
            come back.&quot;
          </p>
          <em>번역: 수플레 팬케이크 최고였어요! 분위기도 아늑했어요.</em>
          <strong>긍정 · 영어</strong>
        </div>
        <p className="gx-card-note">톤을 고르면 바로 답글 초안을 보여드려요.</p>
        <div className="gx-reply-list">
          <button
            onClick={() => setReplyDraft(reviewReplyDrafts.friendly)}
            type="button"
          >
            친근하게 <span>AI 생성</span>
          </button>
          <button
            onClick={() => setReplyDraft(reviewReplyDrafts.polite)}
            type="button"
          >
            정중하게 <span>AI 생성</span>
          </button>
          <button
            onClick={() => setReplyDraft(reviewReplyDrafts.witty)}
            type="button"
          >
            위트있게 <span>AI 생성</span>
          </button>
        </div>
        {replyDraft === null ? null : (
          <div className="gx-suggestion-card" role="status">
            <strong>{replyDraft.label}</strong>
            <p>{replyDraft.copy}</p>
            <small>
              자동 번역 후 등록할 수 있도록 준비된 mocked 답글입니다.
            </small>
          </div>
        )}
      </FlowCard>
      <div className="gx-actions-row">
        <ChoiceButton onClick={() => setShowRiskGuide(true)} tone="ghost">
          악성 리뷰가 들어오면?
        </ChoiceButton>
      </div>
      {showRiskGuide ? (
        <FlowCard title="악성 리뷰 대응 가이드">
          <p className="gx-card-note">
            감정 표현은 줄이고 사실 확인, 사과, 재방문 안내 순서로 답글을
            준비합니다. 신고가 필요한 표현은 별도 확인 상태로 표시합니다.
          </p>
        </FlowCard>
      ) : null}
    </>
  )
}
