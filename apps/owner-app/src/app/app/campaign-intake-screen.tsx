"use client"

import type { FormEvent } from "react"

import { ChatMessage } from "@/app/_components/chat-message"

import { campaignStatusLabel } from "./campaign-model"
import { ChatDivider, FlowCard } from "./reference-flow-shared"
import type { ReferenceFlowScreensProps } from "./reference-flow-screens"

export function CampaignIntakeScreen({
  campaignBrief,
  campaignIntake,
  campaignRequests,
  campaignSelectedFiles,
  onCampaignBriefChange,
  onCampaignFiles,
  onCampaignSubmit,
}: Pick<
  ReferenceFlowScreensProps,
  | "campaignBrief"
  | "campaignIntake"
  | "campaignRequests"
  | "campaignSelectedFiles"
  | "onCampaignBriefChange"
  | "onCampaignFiles"
  | "onCampaignSubmit"
>) {
  const isBusy =
    campaignIntake.kind === "submitting" || campaignIntake.kind === "uploading"

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onCampaignSubmit()
  }

  return (
    <>
      <ChatDivider>마케팅 소재 요청</ChatDivider>
      <ChatMessage
        message="사진과 함께 무엇을, 어떻게 홍보하고 싶은지 적어주세요. 담당자가 확인 후 제작을 시작합니다."
        speaker="assistant"
      />
      <FlowCard title="사진 + 요청 내용">
        <form className="gx-marketing-form" onSubmit={handleSubmit}>
          <label className="gx-upload-picker">
            <input
              accept="image/png,image/jpeg,image/webp,image/heic"
              multiple
              onChange={(event) => onCampaignFiles(event.currentTarget.files)}
              type="file"
            />
            <span>사진 올리기 (최대 10장)</span>
          </label>
          {campaignSelectedFiles.length > 0 ? (
            <ul className="gx-check-list">
              {campaignSelectedFiles.map((file) => (
                <li key={file.name}>{file.name}</li>
              ))}
            </ul>
          ) : null}
          <label className="gx-intent-field">
            <span>무엇을, 어떻게 홍보하고 싶으신가요</span>
            <textarea
              onChange={(event) =>
                onCampaignBriefChange(event.currentTarget.value)
              }
              value={campaignBrief}
            />
          </label>
          <button className="gx-choice-chip" disabled={isBusy} type="submit">
            요청 제출
          </button>
        </form>
      </FlowCard>
      {campaignIntake.kind === "submitting" ? (
        <ChatMessage message="요청을 제출하는 중" speaker="assistant" />
      ) : null}
      {campaignIntake.kind === "uploading" ? (
        <ChatMessage
          message={`사진 업로드 중 (${campaignIntake.uploadedCount}/${campaignIntake.totalCount})`}
          speaker="assistant"
        />
      ) : null}
      {campaignIntake.kind === "success" ? (
        <ChatMessage message="요청이 제출되었습니다." speaker="assistant" />
      ) : null}
      {campaignIntake.kind === "error" ? (
        <div role="alert">
          <ChatMessage message={campaignIntake.message} speaker="assistant" />
        </div>
      ) : null}
      {campaignRequests.length > 0 ? (
        <FlowCard title="요청 현황">
          <ul className="gx-check-list">
            {campaignRequests.map((request) => (
              <li key={request.id}>
                <strong>{campaignStatusLabel(request.status)}</strong>
                <span> · {request.brief}</span>
              </li>
            ))}
          </ul>
        </FlowCard>
      ) : null}
    </>
  )
}
