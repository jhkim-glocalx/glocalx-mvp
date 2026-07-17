import type { MissingBusinessField } from "../schemas"

import type { OnboardingConversationOutput } from "./llm-output"

export type LocalOnboardingSlotExtractionInput = {
  readonly missingFields: readonly MissingBusinessField[]
  readonly ownerMessage: string
  readonly requestedField: MissingBusinessField
}

const explicitPhonePattern =
  /(?:전화번호|전화|번호|전번)\s*(?:는|은|:)?\s*(\+?\d[\d -]{2,}\d)/gu
const broadPhonePattern = /\+?\d[\d -]{5,}\d/gu
const koreanWeekdayHoursPattern =
  /평일\s*(오전|오후)?\s*(\d{1,2})\s*시?\s*(?:[-~]|부터|에서)\s*(오전|오후)?\s*(\d{1,2})\s*시?/u
const englishWeekdayHoursPattern =
  /\bweekdays?\b.*?(\d{1,2})(?::\d{2})?\s*(am|pm)?\s*(?:[-~]|to|until)\s*(\d{1,2})(?::\d{2})?\s*(am|pm)?/iu

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

function extractPhone(ownerMessage: string): readonly string[] {
  const explicitPhones = Array.from(
    ownerMessage.matchAll(explicitPhonePattern),
    (match) => match[1]?.trim()
  ).flatMap((value) => (value === undefined ? [] : [value]))
  const broadPhones = Array.from(
    ownerMessage.matchAll(broadPhonePattern),
    (match) => match[0].trim()
  )

  return uniqueStrings([...explicitPhones, ...broadPhones])
}

function twoDigit(value: number): string {
  return value.toString().padStart(2, "0")
}

type DayPeriod = "am" | "pm"

function koreanPeriodToDayPeriod(
  value: string | undefined
): DayPeriod | undefined {
  switch (value) {
    case "오전":
      return "am"
    case "오후":
      return "pm"
    case undefined:
      return undefined
    default:
      return undefined
  }
}

function englishPeriodToDayPeriod(
  value: string | undefined
): DayPeriod | undefined {
  switch (value?.toLowerCase()) {
    case "am":
      return "am"
    case "pm":
      return "pm"
    case undefined:
      return undefined
    default:
      return undefined
  }
}

function normalizeHourWithPeriod(
  hour: number,
  period: DayPeriod | undefined
): number {
  if (period === "pm" && hour < 12) {
    return hour + 12
  }
  if (period === "am" && hour === 12) {
    return 0
  }
  return hour
}

function normalizeHourRange(
  startRaw: string,
  endRaw: string,
  startPeriod: DayPeriod | undefined = undefined,
  endPeriod: DayPeriod | undefined = undefined
): string {
  const parsedStart = Number.parseInt(startRaw, 10)
  const parsedEnd = Number.parseInt(endRaw, 10)
  if (startPeriod !== undefined) {
    const start = normalizeHourWithPeriod(parsedStart, startPeriod)
    const end = normalizeHourWithPeriod(parsedEnd, endPeriod ?? startPeriod)
    return `${twoDigit(start)}:00-${twoDigit(end)}:00`
  }
  if (endPeriod !== undefined) {
    const inferredStartPeriod =
      endPeriod === "pm" && parsedStart < parsedEnd ? "pm" : undefined
    const start = normalizeHourWithPeriod(parsedStart, inferredStartPeriod)
    const end = normalizeHourWithPeriod(parsedEnd, endPeriod)
    return `${twoDigit(start)}:00-${twoDigit(end)}:00`
  }

  const shouldTreatShortRangeAsAfternoon =
    parsedStart <= 6 && parsedEnd <= 12 && parsedEnd > parsedStart
  const start = shouldTreatShortRangeAsAfternoon
    ? parsedStart + 12
    : parsedStart
  const end =
    shouldTreatShortRangeAsAfternoon ||
    (parsedEnd <= parsedStart && parsedEnd <= 12)
      ? parsedEnd + 12
      : parsedEnd
  return `${twoDigit(start)}:00-${twoDigit(end)}:00`
}

function extractHours(ownerMessage: string): string | undefined {
  const weekdayMatch = koreanWeekdayHoursPattern.exec(ownerMessage)
  const startPeriod = koreanPeriodToDayPeriod(weekdayMatch?.[1])
  const start = weekdayMatch?.[2]
  const endPeriod = koreanPeriodToDayPeriod(weekdayMatch?.[3])
  const end = weekdayMatch?.[4]
  if (start !== undefined && end !== undefined) {
    return `평일 ${normalizeHourRange(start, end, startPeriod, endPeriod)}`
  }

  const englishWeekdayMatch = englishWeekdayHoursPattern.exec(ownerMessage)
  const englishStart = englishWeekdayMatch?.[1]
  const englishStartPeriod = englishPeriodToDayPeriod(englishWeekdayMatch?.[2])
  const englishEnd = englishWeekdayMatch?.[3]
  const englishEndPeriod = englishPeriodToDayPeriod(englishWeekdayMatch?.[4])
  if (englishStart !== undefined && englishEnd !== undefined) {
    return `평일 ${normalizeHourRange(
      englishStart,
      englishEnd,
      englishStartPeriod,
      englishEndPeriod
    )}`
  }

  return undefined
}

function remainingFields(
  requestedFields: readonly MissingBusinessField[],
  extractedFields: OnboardingConversationOutput["extractedFields"]
): MissingBusinessField[] {
  return requestedFields.filter((field) => extractedFields[field] === undefined)
}

export function extractLocalOnboardingSlots(
  input: LocalOnboardingSlotExtractionInput
): OnboardingConversationOutput {
  const phones = extractPhone(input.ownerMessage)
  const phone = input.requestedField === "phone" ? phones[0] : undefined
  const hours =
    input.requestedField === "hours"
      ? extractHours(input.ownerMessage)
      : undefined
  const extractedFields: OnboardingConversationOutput["extractedFields"] = {
    ...(hours === undefined ? {} : { hours }),
    ...(phone === undefined ? {} : { phone }),
  }
  const fieldConfidence: OnboardingConversationOutput["fieldConfidence"] = {
    ...(hours === undefined ? {} : { hours: "high" }),
    ...(phone === undefined
      ? {}
      : { phone: phones.length === 1 ? "high" : "low" }),
  }
  const missingFields = remainingFields(input.missingFields, extractedFields)
  const lowConfidence = Object.values(fieldConfidence).includes("low")
  const nextState =
    lowConfidence || missingFields.length > 0
      ? "slot_clarification"
      : "profile_summary"

  return {
    assistantMessage:
      nextState === "profile_summary"
        ? "전화번호와 영업시간을 확인했어요. 마지막으로 요약을 확인해주세요."
        : "아직 빈 칸이 남아 있어요. 전화번호나 영업시간을 한 번 더 알려주세요.",
    confidence: lowConfidence ? "low" : "high",
    extractedFields,
    fieldConfidence,
    missingFields,
    needsOwnerConfirmation: nextState === "profile_summary",
    nextState,
  }
}
