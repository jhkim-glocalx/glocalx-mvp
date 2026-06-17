import type { AdapterResult } from "./contracts"

export type MarketingPlatform = "GBP" | "INSTAGRAM"
export type MarketingLocale = "ko" | "en" | "ja" | "zh"
export type MarketingTranslationLocale = "en" | "ja" | "zh"

export type MarketingSuggestionMode = "request" | "accepted" | "skipped"

export type MarketingImageAssetInput = {
  readonly dataUrl?: string | undefined
  readonly id: string
  readonly name: string
  readonly mimeType: string
  readonly sizeBytes: number
}

export type MarketingGenerationInput = {
  readonly acceptedSuggestionId?: string
  readonly imageAssets: readonly MarketingImageAssetInput[]
  readonly ownerIntent: string
  readonly storeAddress: string
  readonly storeName: string
  readonly suggestionMode: MarketingSuggestionMode
}

export type MarketingIntentAnalysis = {
  readonly audience: string
  readonly keywords: readonly string[]
  readonly objective: string
  readonly promotionWindow: string
  readonly tone: string
}

export type MarketingImageOutput = {
  readonly altText: string
  readonly assetId: string
  readonly cropFocus: string
  readonly cssFilter: string
  readonly editedDataUrl?: string | undefined
  readonly editedLabel: string
  readonly editSummary: string
  readonly originalLabel: string
  readonly qualityScore: number
}

export type MarketingSuggestion = {
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

export type MarketingPlatformPreview = {
  readonly aspectRatio: string
  readonly callToAction: string
  readonly copy: string
  readonly hashtags: readonly string[]
  readonly imageAssetId: string | null
  readonly label: string
  readonly locale?: MarketingLocale | undefined
  readonly platform: MarketingPlatform
  readonly translations: readonly MarketingCaptionTranslation[]
  readonly uploadNotes: readonly string[]
}

export type MarketingGenerationResult = {
  readonly images: readonly MarketingImageOutput[]
  readonly intentAnalysis: MarketingIntentAnalysis
  readonly platformPreviews: readonly MarketingPlatformPreview[]
  readonly suggestion: MarketingSuggestion | null
}

export interface MarketingGenerationAdapter {
  generateMarketingDraft(
    input: MarketingGenerationInput
  ): Promise<AdapterResult<MarketingGenerationResult>>
}
