"use client"

import { useState } from "react"

import { ChatPanel } from "@/app/_components/chat-panel"
import { MobileShell } from "@/app/_components/mobile-shell"
import { useActivityTrail } from "@/app/_components/use-activity-trail"
import { useCsChat } from "@/app/_components/use-cs-chat"

import { onboardingActivityStage } from "./onboarding-activity-stage"
import { OnboardingComposer } from "./onboarding-composer"
import {
  GbpHandoffPanel,
  SetupPanel,
  StoreProfileFormPanel,
} from "./onboarding-gbp-panels"
import {
  ExtractionPanel,
  OnboardingIntro,
  OnboardingTopBar,
  SlotCollectionPanel,
} from "./onboarding-panels"
import { useOnboardingFlow } from "./use-onboarding-flow"

export function OnboardingFlow() {
  const onboarding = useOnboardingFlow()
  const { actions, refs, state } = onboarding
  const activity = useActivityTrail()
  const [supportOpen, setSupportOpen] = useState(false)
  const chat = useCsChat({
    activity,
    open: supportOpen,
    section: "onboarding",
    stage: onboardingActivityStage(state),
  })

  function toggleSupport(): void {
    const next = !supportOpen
    setSupportOpen(next)
    activity.recordAction("onboarding", next ? "chat_opened" : "chat_closed")
    if (next) {
      chat.markRead()
    }
  }

  return (
    <main className="gx-route-page">
      <MobileShell
        bottomBar={
          <OnboardingComposer
            extraction={state.extraction}
            input={state.input}
            inputMode={state.inputMode}
            inputRef={refs.inputRef}
            onInputChange={actions.inputChange}
            onNaverLinkAttach={actions.naverLinkAttach}
            onSubmit={actions.submit}
            profileDraft={state.profileDraft}
            slotCollectionActive={state.slotCollectionActive}
            slotState={state.slotState}
          />
        }
        overlay={
          supportOpen ? (
            <div className="gx-chat-overlay" data-testid="onboarding-support">
              <ChatPanel
                messages={chat.messages}
                onClose={toggleSupport}
                onSend={chat.send}
                sending={chat.sending}
                variant="sheet"
              />
            </div>
          ) : undefined
        }
        screenRef={refs.screenRef}
        topBar={
          <OnboardingTopBar
            support={{ onOpen: toggleSupport, unread: chat.unread }}
          />
        }
      >
        <OnboardingIntro
          onNaverLinkAttach={actions.naverLinkAttach}
          onStoreNameSearch={actions.storeNameSearch}
        />
        <ExtractionPanel
          extraction={state.extraction}
          onCandidateSearchAgain={actions.searchAgain}
          onCandidateSelect={actions.selectCandidate}
          profileDraft={state.profileDraft}
          submittedInput={state.submittedInput}
        />
        <StoreProfileFormPanel
          confirmation={state.confirmation}
          onConfirm={actions.confirm}
          onFieldChange={actions.changeDraftField}
          profileDraft={state.profileDraft}
        />
        <SlotCollectionPanel
          profileDraft={state.profileDraft}
          slotMessages={state.slotMessages}
          slotState={state.slotState}
        />
        <GbpHandoffPanel
          adoption={state.adoption}
          onClaimExisting={actions.claimExisting}
          confirmation={state.confirmation}
          onSetup={actions.checkSetup}
          setup={state.setup}
        />
        <SetupPanel onRetry={actions.checkSetup} setup={state.setup} />
      </MobileShell>
    </main>
  )
}
