"use client"

import type { StoreProfileField } from "@/app/onboarding/onboarding-components"
import type {
  ConfirmationState,
  ExtractionState,
  OnboardingChatTurn,
  OnboardingSlotTurnState,
  SetupState,
  StoreProfileDraft,
} from "@/app/onboarding/onboarding-model"

import type {
  AppNavId,
  DraftState,
  MarketingImageAsset,
  PostingChatTurn,
  PostingDecisionTurnState,
  PublishState,
  MarketingPlatform,
} from "./app-workspace-model"
import { CampaignIntakeScreen } from "./campaign-intake-screen"
import type {
  CampaignIntakeState,
  CampaignRequestDetail,
  CampaignRequestSummary,
} from "./campaign-model"
import type { CampaignReviewNotice } from "./use-campaign-review"
import { OnboardingSnapshot } from "./onboarding-snapshot"
import { PhotoScreen } from "./reference-flow-photo-screen"
import { PostingScreen } from "./reference-flow-posting-screen"
import {
  DashboardScreen,
  ReportScreen,
  TargetsScreen,
} from "./reference-flow-reporting-screens"
import { ReviewsScreen } from "./reference-flow-review-screen"
import { FlowNav } from "./reference-flow-shared"

export type ReferenceFlowScreensProps = {
  readonly activeNavId: AppNavId
  readonly activePreviewKey: string
  readonly campaignBrief: string
  readonly campaignIntake: CampaignIntakeState
  readonly campaignRequests: readonly CampaignRequestSummary[]
  readonly campaignSelectedFiles: readonly File[]
  readonly campaignReviewBusy: boolean
  readonly campaignReviewNote: string
  readonly campaignReviewNotice: CampaignReviewNotice | null
  readonly campaignReviewing: CampaignRequestDetail | null
  readonly onCampaignBriefChange: (brief: string) => void
  readonly onCampaignFiles: (files: FileList | null) => void
  readonly onCampaignReviewClose: () => void
  readonly onCampaignReviewDecision: (decision: string) => void
  readonly onCampaignReviewNoteChange: (note: string) => void
  readonly onCampaignReviewOpen: (requestId: string) => void
  readonly onCampaignSubmit: () => void
  readonly draft: DraftState
  readonly imageAssets: readonly MarketingImageAsset[]
  readonly intent: string
  readonly onDraftSubmit: () => void
  readonly onImageFiles: (files: FileList | null) => void
  readonly onIntentChange: (intent: string) => void
  readonly onPreviewChange: (previewKey: string) => void
  readonly onComposerPreset: (message: string) => void
  readonly onboardingConfirmation: ConfirmationState
  readonly onboardingExtraction: ExtractionState
  readonly onboardingProfileDraft: StoreProfileDraft | undefined
  readonly onboardingSetup: SetupState
  readonly onboardingSlotMessages: readonly OnboardingChatTurn[]
  readonly onboardingSlotState: OnboardingSlotTurnState
  readonly onboardingSubmittedInput: string
  readonly onOnboardingCandidateSearchAgain: () => void
  readonly onOnboardingCandidateSelect: (candidate: StoreProfileDraft) => void
  readonly onOnboardingConfirm: () => void
  readonly onOnboardingFieldChange: (
    field: StoreProfileField,
    value: string
  ) => void
  readonly onOnboardingSetup: () => void
  readonly onPublish: (platform: MarketingPlatform) => void
  readonly onSelect: (navId: AppNavId) => void
  readonly onSuggestionAccept: () => void
  readonly onSuggestionSkip: () => void
  readonly postingChatTurns: readonly PostingChatTurn[]
  readonly postingDecision: PostingDecisionTurnState
  readonly publish: PublishState
}

export function ReferenceFlowScreens({
  activeNavId,
  activePreviewKey,
  campaignBrief,
  campaignIntake,
  campaignRequests,
  campaignReviewBusy,
  campaignReviewNote,
  campaignReviewNotice,
  campaignReviewing,
  campaignSelectedFiles,
  onCampaignReviewClose,
  onCampaignReviewDecision,
  onCampaignReviewNoteChange,
  onCampaignReviewOpen,
  onCampaignBriefChange,
  onCampaignFiles,
  onCampaignSubmit,
  draft,
  imageAssets,
  intent,
  onDraftSubmit,
  onImageFiles,
  onIntentChange,
  onPreviewChange,
  onComposerPreset,
  onboardingConfirmation,
  onboardingExtraction,
  onboardingProfileDraft,
  onboardingSetup,
  onboardingSlotMessages,
  onboardingSlotState,
  onboardingSubmittedInput,
  onOnboardingCandidateSearchAgain,
  onOnboardingCandidateSelect,
  onOnboardingConfirm,
  onOnboardingFieldChange,
  onOnboardingSetup,
  onPublish,
  onSelect,
  onSuggestionAccept,
  onSuggestionSkip,
  postingChatTurns,
  postingDecision,
  publish,
}: ReferenceFlowScreensProps) {
  if (activeNavId === "dashboard") {
    return (
      <section className="gx-chat-stage" aria-label="글로컬엑스 작업 흐름">
        <FlowNav activeNavId={activeNavId} onSelect={onSelect} />
        <DashboardScreen onBack={() => onSelect("report")} />
      </section>
    )
  }

  return (
    <section className="gx-chat-stage" aria-label="글로컬엑스 작업 흐름">
      <FlowNav activeNavId={activeNavId} onSelect={onSelect} />
      {activeNavId === "onboarding" ? (
        <OnboardingSnapshot
          confirmation={onboardingConfirmation}
          extraction={onboardingExtraction}
          onCandidateSearchAgain={onOnboardingCandidateSearchAgain}
          onCandidateSelect={onOnboardingCandidateSelect}
          onConfirm={onOnboardingConfirm}
          onFieldChange={onOnboardingFieldChange}
          onComposerPreset={onComposerPreset}
          onSetup={onOnboardingSetup}
          profileDraft={onboardingProfileDraft}
          setup={onboardingSetup}
          slotMessages={onboardingSlotMessages}
          slotState={onboardingSlotState}
          submittedInput={onboardingSubmittedInput}
        />
      ) : null}
      {activeNavId === "photo" ? (
        <PhotoScreen
          draft={draft}
          imageAssets={imageAssets}
          intent={intent}
          onDraftSubmit={onDraftSubmit}
          onImageFiles={onImageFiles}
          onIntentChange={onIntentChange}
          onSelect={onSelect}
          onSuggestionAccept={onSuggestionAccept}
          onSuggestionSkip={onSuggestionSkip}
          postingChatTurns={postingChatTurns}
          postingDecision={postingDecision}
        />
      ) : null}
      {activeNavId === "posting" ? (
        <PostingScreen
          activePreviewKey={activePreviewKey}
          draft={draft}
          imageAssets={imageAssets}
          onPreviewChange={onPreviewChange}
          onPublish={onPublish}
          publish={publish}
        />
      ) : null}
      {activeNavId === "campaigns" ? (
        <CampaignIntakeScreen
          campaignBrief={campaignBrief}
          campaignIntake={campaignIntake}
          campaignRequests={campaignRequests}
          campaignReviewBusy={campaignReviewBusy}
          campaignReviewNote={campaignReviewNote}
          campaignReviewNotice={campaignReviewNotice}
          campaignReviewing={campaignReviewing}
          campaignSelectedFiles={campaignSelectedFiles}
          onCampaignBriefChange={onCampaignBriefChange}
          onCampaignFiles={onCampaignFiles}
          onCampaignReviewClose={onCampaignReviewClose}
          onCampaignReviewDecision={onCampaignReviewDecision}
          onCampaignReviewNoteChange={onCampaignReviewNoteChange}
          onCampaignReviewOpen={onCampaignReviewOpen}
          onCampaignSubmit={onCampaignSubmit}
        />
      ) : null}
      {activeNavId === "reviews" ? <ReviewsScreen /> : null}
      {activeNavId === "targets" ? <TargetsScreen /> : null}
      {activeNavId === "report" ? <ReportScreen onSelect={onSelect} /> : null}
    </section>
  )
}
