"use client"

import type { FormEvent } from "react"

import { ChatMessage } from "@/app/_components/chat-message"

import type {
  PostingChatTurn,
  PostingDecisionTurnState,
} from "./app-workspace-model"
import { AssetThumbs, ImageComparison } from "./reference-flow-image-assets"
import { ChatDivider, ChoiceButton, FlowCard } from "./reference-flow-shared"
import type { ReferenceFlowScreensProps } from "./reference-flow-screens"

function PostingDecisionMessages({
  postingChatTurns,
  postingDecision,
}: {
  readonly postingChatTurns: readonly PostingChatTurn[]
  readonly postingDecision: PostingDecisionTurnState
}) {
  return (
    <div className="grid gap-2">
      {postingChatTurns.map((turn) => (
        <ChatMessage
          key={turn.id}
          message={turn.message}
          speaker={turn.speaker}
        />
      ))}
      {postingDecision.kind === "loading" ? (
        <ChatMessage
          message="제안 반영 여부를 이해하는 중"
          speaker="assistant"
        />
      ) : null}
      {postingDecision.kind === "ready" ? (
        <div className="gx-suggestion-card" role="status">
          <strong>제안 반영 완료</strong>
          <p>{postingDecision.assistantMessage}</p>
        </div>
      ) : null}
      {postingDecision.kind === "error" ? (
        <div role="alert">
          <ChatMessage message={postingDecision.message} speaker="assistant" />
        </div>
      ) : null}
    </div>
  )
}

export function PhotoScreen({
  draft,
  imageAssets,
  intent,
  onDraftSubmit,
  onImageFiles,
  onIntentChange,
  onSelect,
  onSuggestionAccept,
  onSuggestionSkip,
  postingChatTurns,
  postingDecision,
}: Pick<
  ReferenceFlowScreensProps,
  | "draft"
  | "imageAssets"
  | "intent"
  | "onDraftSubmit"
  | "onImageFiles"
  | "onIntentChange"
  | "onSelect"
  | "onSuggestionAccept"
  | "onSuggestionSkip"
  | "postingChatTurns"
  | "postingDecision"
>) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onDraftSubmit()
  }

  return (
    <>
      <ChatDivider>STEP 2 · 홍보 콘텐츠 넣기</ChatDivider>
      <ChatMessage
        message="홍보를 하기위해 최소한의 사진과 우리 매장에 홍보하고 싶은 어필포인트,자랑,메뉴 등을 적어주세요. 그러면 저희가 알아서, 사진 보정, 외국어 문구, 자동홍보까지 알아서 해드려요"
        speaker="assistant"
      />
      <FlowCard title="사진 + 알리고 싶은 말이나 단어">
        <form className="gx-marketing-form" onSubmit={handleSubmit}>
          <label className="gx-upload-picker">
            <input
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(event) => onImageFiles(event.currentTarget.files)}
              type="file"
            />
            <span>알리고 싶은 사진 올리기</span>
          </label>
          <AssetThumbs imageAssets={imageAssets} />
          <label className="gx-intent-field">
            <span>알리고 싶은 말이나 단어</span>
            <textarea
              onChange={(event) => onIntentChange(event.currentTarget.value)}
              value={intent}
            />
          </label>
          <button
            className="gx-choice-chip"
            disabled={draft.kind === "loading"}
            type="submit"
          >
            홍보 문구 분석 및 사진 보정
          </button>
        </form>
      </FlowCard>
      {draft.kind === "loading" ? (
        <ChatMessage
          message="사진과 알리고 싶은 말을 분석하는 중"
          speaker="assistant"
        />
      ) : null}
      {draft.kind === "error" ? (
        <ChatMessage message={draft.message} speaker="assistant" />
      ) : null}
      {draft.kind === "ready" ? (
        <>
          <ChatMessage message={intent} speaker="owner" />
          {draft.intentAnalysis === null ? null : (
            <FlowCard title="알리고 싶은 말 분석 결과">
              <dl className="gx-check-list">
                <div>
                  <dt>목표</dt>
                  <dd>{draft.intentAnalysis.objective}</dd>
                </div>
                <div>
                  <dt>고객</dt>
                  <dd>{draft.intentAnalysis.audience}</dd>
                </div>
                <div>
                  <dt>키워드</dt>
                  <dd>{draft.intentAnalysis.keywords.join(", ")}</dd>
                </div>
              </dl>
            </FlowCard>
          )}
          {draft.images.length > 0 ? (
            <FlowCard title="이미지 개선 결과">
              <div className="gx-image-result-list">
                {draft.images.map((image) => (
                  <ImageComparison
                    image={image}
                    imageAssets={imageAssets}
                    key={image.assetId}
                  />
                ))}
              </div>
            </FlowCard>
          ) : null}
          {draft.suggestion === null ? null : (
            <FlowCard title="방문을 늘리는 문구 제안">
              <div className="gx-suggestion-card">
                <strong>{draft.suggestion.title}</strong>
                <p>{draft.suggestion.message}</p>
                <small>{draft.suggestion.rationale}</small>
              </div>
              <div className="gx-actions-row">
                <ChoiceButton onClick={onSuggestionAccept}>
                  제안 반영
                </ChoiceButton>
                <ChoiceButton onClick={onSuggestionSkip} tone="ghost">
                  제안 없이 진행
                </ChoiceButton>
              </div>
              <PostingDecisionMessages
                postingChatTurns={postingChatTurns}
                postingDecision={postingDecision}
              />
            </FlowCard>
          )}
          <div className="gx-actions-row">
            <ChoiceButton onClick={() => onSelect("posting")}>
              게시물 미리보기
            </ChoiceButton>
          </div>
        </>
      ) : null}
    </>
  )
}
