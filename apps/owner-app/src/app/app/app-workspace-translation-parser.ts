import { isRecord, readString } from "@/app/_components/json-value"

import type {
  MarketingCaptionTranslation,
  MarketingLocale,
  MarketingTranslationLocale,
} from "./app-workspace-draft-types"

export const translationLocales = ["en", "ja", "zh"] as const

export function labelForLocale(locale: MarketingTranslationLocale): string {
  if (locale === "ja") {
    return "Japanese"
  }
  if (locale === "zh") {
    return "Chinese"
  }
  return "English"
}

export function readMarketingLocale(value: unknown): MarketingLocale {
  const locale = readString(value)
  switch (locale) {
    case "en":
    case "ja":
    case "zh":
      return locale
    case "ko":
    case undefined:
      return "ko"
    default:
      return "ko"
  }
}

function readTranslationLocale(
  value: unknown
): MarketingTranslationLocale | undefined {
  const locale = readString(value)
  switch (locale) {
    case "en":
    case "ja":
    case "zh":
      return locale
    default:
      return undefined
  }
}

function parseCaptionTranslation(
  value: unknown
): MarketingCaptionTranslation | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const locale = readTranslationLocale(value["locale"])
  const copy = readString(value["copy"])
  if (locale === undefined || copy === undefined) {
    return undefined
  }

  return {
    copy,
    label: labelForLocale(locale),
    locale,
  }
}

export function readCaptionTranslations(
  value: unknown
): readonly MarketingCaptionTranslation[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    const translation = parseCaptionTranslation(item)
    return translation === undefined ? [] : [translation]
  })
}

function hasHangul(value: string): boolean {
  return /\p{Script=Hangul}/u.test(value)
}

function englishFallback(englishCopy: string): string {
  const trimmed = englishCopy.trim()
  if (trimmed !== "" && !hasHangul(trimmed)) {
    return trimmed
  }
  return "Fresh local-store update: visit us in Seoul this week."
}

function fallbackTranslationCopy(
  locale: MarketingTranslationLocale,
  englishCopy: string
): string {
  if (locale === "ja") {
    return "今週のおすすめ情報です。ソウルであたたかい時間をお楽しみください。"
  }
  if (locale === "zh") {
    return "本周新消息已经准备好。欢迎来到首尔享受温暖的用餐时光。"
  }
  return englishFallback(englishCopy)
}

export function completeTranslations(
  translations: readonly MarketingCaptionTranslation[],
  englishCopy: string
): readonly MarketingCaptionTranslation[] {
  return translationLocales.map((locale) => {
    const existing = translations.find(
      (translation) => translation.locale === locale
    )
    return (
      existing ?? {
        copy: fallbackTranslationCopy(locale, englishCopy),
        label: labelForLocale(locale),
        locale,
      }
    )
  })
}
