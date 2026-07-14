"use client"

import type { FormEvent, RefObject } from "react"

import {
  firstMissingStoreProfileField,
  type MissingStoreProfileField,
} from "./onboarding-draft-fields"
import type {
  ExtractionState,
  OnboardingSlotTurnState,
  StoreProfileDraft,
} from "./onboarding-model"

export type OnboardingInputMode = "naverLink" | "storeName"

function slotPlaceholder(
  requestedField: MissingStoreProfileField | undefined
): string {
  switch (requestedField) {
    case "phone":
      return "전화번호를 입력해주세요"
    case "hours":
      return "예: 평일 오후 6시부터 10시까지"
    case undefined:
      return "매장 정보를 입력해주세요"
  }
}

export function OnboardingComposer({
  extraction,
  input,
  inputMode,
  inputRef,
  onInputChange,
  onNaverLinkAttach,
  onSubmit,
  profileDraft,
  slotCollectionActive,
  slotState,
}: {
  readonly extraction: ExtractionState
  readonly input: string
  readonly inputMode: OnboardingInputMode
  readonly inputRef: RefObject<HTMLInputElement | null>
  readonly onInputChange: (value: string) => void
  readonly onNaverLinkAttach: () => void
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
  readonly profileDraft: StoreProfileDraft | undefined
  readonly slotCollectionActive: boolean
  readonly slotState: OnboardingSlotTurnState
}) {
  return (
    <form
      aria-label={slotCollectionActive ? "매장 정보 답변" : "네이버 정보 제출"}
      className="gx-inputbar"
      onSubmit={onSubmit}
    >
      <button
        aria-label="네이버 링크 첨부"
        className="gx-input-plus"
        onClick={onNaverLinkAttach}
        type="button"
      >
        +
      </button>
      <label className="sr-only" htmlFor="naver-store-input">
        네이버 정보
      </label>
      <input
        className="gx-composer-input"
        id="naver-store-input"
        onChange={(event) => onInputChange(event.currentTarget.value)}
        placeholder={
          slotCollectionActive
            ? slotPlaceholder(
                profileDraft === undefined
                  ? undefined
                  : firstMissingStoreProfileField(profileDraft)
              )
            : inputMode === "naverLink"
              ? "네이버플레이스 링크 붙여넣기"
              : "네이버플레이스 링크나 상호명"
        }
        ref={inputRef}
        type="text"
        value={input}
      />
      <button
        aria-label="네이버 정보 제출"
        className="gx-input-send"
        disabled={extraction.kind === "loading" || slotState.kind === "loading"}
        type="submit"
      >
        <span aria-hidden="true">➤</span>
      </button>
    </form>
  )
}
