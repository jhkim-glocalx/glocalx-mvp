export type DraftState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly draftId: string
      readonly englishCopy: string
      readonly generationStatus: string
      readonly images: readonly DraftImagePreview[]
      readonly intentAnalysis: DraftIntentAnalysis | null
      readonly kind: "ready"
      readonly koreanCopy: string
      readonly platformPreviews: readonly PlatformPostPreview[]
      readonly suggestion: DraftSuggestion | null
    }
  | { readonly kind: "error"; readonly message: string }

export type PostingChatTurn = {
  readonly id: string
  readonly message: string
  readonly speaker: "assistant" | "owner"
}

export type PostingDecisionTurnState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly assistantMessage: string
      readonly decision: string
      readonly draft: DraftState | null
      readonly kind: "ready"
      readonly revisedIntent: string | null
      readonly sessionId: string
    }
  | { readonly kind: "error"; readonly message: string }

export type MarketingPlatform = "GBP" | "INSTAGRAM"
export type MarketingLocale = "ko" | "en" | "ja" | "zh"
export type MarketingTranslationLocale = "en" | "ja" | "zh"

export type MarketingImageAsset = {
  readonly dataUrl: string
  readonly id: string
  readonly mimeType: "image/jpeg" | "image/png" | "image/webp"
  readonly name: string
  readonly requestDataUrl?: string
  readonly requestMimeType?: "image/jpeg"
  readonly sizeBytes: number
}

export type DraftIntentAnalysis = {
  readonly audience: string
  readonly keywords: readonly string[]
  readonly objective: string
  readonly promotionWindow: string
  readonly tone: string
}

export type DraftImagePreview = {
  readonly altText: string
  readonly assetId: string
  readonly cropFocus: string
  readonly cssFilter: string
  readonly editedDataUrl: string | null
  readonly editedLabel: string
  readonly editSummary: string
  readonly originalLabel: string
  readonly qualityScore: number
}

export type DraftSuggestion = {
  readonly id: string
  readonly message: string
  readonly ownerAction: string
  readonly rationale: string
  readonly revisedIntent: string
  readonly title: string
}

export type MarketingCaptionTranslation = {
  readonly copy: string
  readonly label: string
  readonly locale: MarketingTranslationLocale
}

export type PlatformPostPreview = {
  readonly aspectRatio: string
  readonly callToAction: string
  readonly copy: string
  readonly hashtags: readonly string[]
  readonly imageAssetId: string | null
  readonly label: string
  readonly locale: "ko"
  readonly platform: MarketingPlatform
  readonly translations: readonly MarketingCaptionTranslation[]
  readonly uploadNotes: readonly string[]
}
