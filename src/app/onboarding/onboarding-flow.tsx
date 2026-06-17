"use client"

import { MobileShell } from "@/app/_components/mobile-shell"

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
        screenRef={refs.screenRef}
        topBar={<OnboardingTopBar />}
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
          confirmation={state.confirmation}
          onSetup={actions.checkSetup}
          setup={state.setup}
        />
        <SetupPanel setup={state.setup} />
      </MobileShell>
    </main>
  )
}
