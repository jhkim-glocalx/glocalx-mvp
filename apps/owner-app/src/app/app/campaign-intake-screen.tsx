"use client"

import type { FormEvent } from "react"

import { ChatMessage } from "@/app/_components/chat-message"

import {
  publishChannelLabel,
  publishJobStatusLabel,
} from "@/campaigns/status-labels"

import { campaignStatusLabel } from "./campaign-model"
import { ChatDivider, FlowCard } from "./reference-flow-shared"
import type { ReferenceFlowScreensProps } from "./reference-flow-screens"

export function CampaignIntakeScreen({
  campaignBrief,
  campaignIntake,
  campaignRequests,
  campaignReviewBusy,
  campaignReviewNote,
  campaignReviewNotice,
  campaignReviewing,
  campaignSelectedFiles,
  onCampaignBriefChange,
  onCampaignFiles,
  onCampaignReviewClose,
  onCampaignReviewDecision,
  onCampaignReviewNoteChange,
  onCampaignReviewOpen,
  onCampaignSubmit,
}: Pick<
  ReferenceFlowScreensProps,
  | "campaignBrief"
  | "campaignIntake"
  | "campaignRequests"
  | "campaignReviewBusy"
  | "campaignReviewNote"
  | "campaignReviewNotice"
  | "campaignReviewing"
  | "campaignSelectedFiles"
  | "onCampaignBriefChange"
  | "onCampaignFiles"
  | "onCampaignReviewClose"
  | "onCampaignReviewDecision"
  | "onCampaignReviewNoteChange"
  | "onCampaignReviewOpen"
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
                {request.publishJobs.length === 0 ? null : (
                  <span
                    className="gx-campaign-publish-status"
                    data-testid={`campaign-publish-status-${request.id}`}
                  >
                    {request.publishJobs
                      .map(
                        (job) =>
                          `${publishChannelLabel(job.channel)} ${publishJobStatusLabel(job.status)}`
                      )
                      .join(" · ")}
                  </span>
                )}
                {request.status === "ready_for_review" ? (
                  <button
                    className="gx-choice-chip"
                    data-testid={`campaign-review-open-${request.id}`}
                    disabled={campaignReviewBusy}
                    onClick={() => onCampaignReviewOpen(request.id)}
                    type="button"
                  >
                    소재 확인하기
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </FlowCard>
      ) : null}
      {campaignReviewNotice !== null ? (
        <div role={campaignReviewNotice.tone === "error" ? "alert" : "status"}>
          <ChatMessage
            message={campaignReviewNotice.message}
            speaker="assistant"
          />
        </div>
      ) : null}
      {campaignReviewing !== null ? (
        <FlowCard title="완성된 소재">
          <div className="gx-campaign-review" data-testid="campaign-review">
            <div className="gx-campaign-review-assets">
              {campaignReviewing.assets
                .filter((asset) => asset.kind === "processed")
                .map((asset) =>
                  asset.signedUrl === null ? null : (
                    /* eslint-disable-next-line @next/next/no-img-element --
                       signed Blob URLs expire, so the optimizer's cache would
                       serve dead links. */
                    <img
                      alt="완성된 홍보 소재"
                      className="gx-campaign-review-asset"
                      key={asset.id}
                      src={asset.signedUrl}
                    />
                  )
                )}
            </div>
            {campaignReviewing.finalCopy === null ? null : (
              <p
                className="gx-campaign-review-copy"
                data-testid="campaign-review-copy"
              >
                {campaignReviewing.finalCopy}
              </p>
            )}
            <label className="gx-intent-field">
              <span>수정이 필요하면 어떤 부분인지 알려주세요</span>
              <textarea
                onChange={(event) =>
                  onCampaignReviewNoteChange(event.currentTarget.value)
                }
                value={campaignReviewNote}
              />
            </label>
            <div className="gx-campaign-review-actions">
              <button
                className="gx-choice-chip"
                data-testid="campaign-review-go"
                disabled={campaignReviewBusy}
                onClick={() => onCampaignReviewDecision("go")}
                type="button"
              >
                승인하고 게시 요청
              </button>
              <button
                className="gx-choice-chip"
                data-testid="campaign-review-changes"
                disabled={campaignReviewBusy}
                onClick={() => onCampaignReviewDecision("changes_requested")}
                type="button"
              >
                수정 요청
              </button>
              <button
                className="gx-choice-chip"
                data-testid="campaign-review-no-go"
                disabled={campaignReviewBusy}
                onClick={() => onCampaignReviewDecision("no_go")}
                type="button"
              >
                반려
              </button>
              <button
                className="gx-choice-chip"
                disabled={campaignReviewBusy}
                onClick={onCampaignReviewClose}
                type="button"
              >
                닫기
              </button>
            </div>
          </div>
        </FlowCard>
      ) : null}
    </>
  )
}
