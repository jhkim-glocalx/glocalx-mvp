import type {
  OnboardingConversationAdapter,
  OnboardingSlotExtractionInput,
  PostingConversationAdapter,
  PostingOwnerReplyInput,
} from "./conversation-contracts"
import type { AdapterResult } from "./contracts"
import type {
  OnboardingConversationOutput,
  PostingConversationDecision,
} from "@/conversations/contracts"
import type { MissingBusinessField } from "@/domain/schemas"

const phonePattern = /\+?\d[\d -]{5,}\d/gu

function extractPhone(ownerMessage: string): readonly string[] {
  return Array.from(ownerMessage.matchAll(phonePattern), (match) =>
    match[0].trim()
  )
}

function twoDigit(value: number): string {
  return value.toString().padStart(2, "0")
}

function normalizeHourRange(startRaw: string, endRaw: string): string {
  const start = Number.parseInt(startRaw, 10)
  const parsedEnd = Number.parseInt(endRaw, 10)
  const end = parsedEnd <= start && parsedEnd <= 12 ? parsedEnd + 12 : parsedEnd
  return `${twoDigit(start)}:00-${twoDigit(end)}:00`
}

function extractHours(ownerMessage: string): string | undefined {
  const weekdayMatch = /평일\s*(\d{1,2})\s*[-~]\s*(\d{1,2})/u.exec(
    ownerMessage
  )
  const start = weekdayMatch?.[1]
  const end = weekdayMatch?.[2]
  if (start !== undefined && end !== undefined) {
    return `평일 ${normalizeHourRange(start, end)}`
  }
  return undefined
}

function remainingFields(
  requestedFields: readonly MissingBusinessField[],
  extractedFields: Readonly<Record<MissingBusinessField, string | undefined>>
): MissingBusinessField[] {
  return requestedFields.filter((field) => extractedFields[field] === undefined)
}

function extractOnboardingSlots(
  input: OnboardingSlotExtractionInput
): OnboardingConversationOutput {
  const phones = extractPhone(input.ownerMessage)
  const phone = phones.length > 0 ? phones[0] : undefined
  const hours = extractHours(input.ownerMessage)
  const extractedFields = {
    ...(hours === undefined ? {} : { hours }),
    ...(phone === undefined ? {} : { phone }),
  }
  const fieldConfidence = {
    ...(hours === undefined ? {} : { hours: "high" as const }),
    ...(phone === undefined
      ? {}
      : { phone: phones.length === 1 ? "high" as const : "low" as const }),
  }
  const missingFields = remainingFields(input.missingFields, {
    hours,
    phone,
  })
  const lowConfidence = Object.values(fieldConfidence).includes("low")
  const nextState =
    lowConfidence || missingFields.length > 0
      ? "slot_clarification"
      : "profile_summary"

  return {
    assistantMessage:
      nextState === "profile_summary"
        ? "전화번호와 영업시간을 확인했어요. 마지막으로 요약을 확인해주세요."
        : "확인이 필요한 정보가 있어요. 전화번호나 영업시간을 한 번 더 알려주세요.",
    confidence: lowConfidence ? "low" : "high",
    extractedFields,
    fieldConfidence,
    missingFields,
    needsOwnerConfirmation: nextState === "profile_summary",
    nextState,
  }
}

function classifyPostingReply(
  input: PostingOwnerReplyInput
): PostingConversationDecision {
  const normalized = input.ownerMessage.trim().toLowerCase()
  if (/날씨|뉴스|주가|환율|정치|내일/u.test(input.ownerMessage)) {
    return {
      assistantMessage:
        "현재 게시물과 제안에 관한 질문만 도와드릴 수 있어요. 제안을 반영할지 알려주세요.",
      decision: "question",
      ownerQuestion: input.ownerMessage,
      questionScope: "out_of_scope",
    }
  }
  if (/좋아|반영|수락|ok|오케이/u.test(normalized)) {
    return {
      acceptedSuggestionId: input.activeSuggestionId,
      assistantMessage: "좋아요. 제안을 반영해서 초안을 준비할게요.",
      decision: "accepted",
    }
  }
  if (/그냥\s*진행|스킵|건너|skip/u.test(normalized)) {
    return {
      assistantMessage: "알겠습니다. 제안은 건너뛰고 초안을 진행할게요.",
      decision: "skipped",
    }
  }
  if (/바꿔|수정|젊은|톤|더/u.test(input.ownerMessage)) {
    return {
      assistantMessage: "요청하신 방향으로 초안을 다시 잡아볼게요.",
      decision: "revision_requested",
      revisedIntent: input.ownerMessage.trim(),
    }
  }
  return {
    assistantMessage:
      "이 제안은 현재 초안의 전환을 높이기 위한 보완이에요. 반영, 건너뛰기, 수정 중에서 알려주세요.",
    decision: "question",
    ownerQuestion: input.ownerMessage,
    questionScope: "grounded",
  }
}

export function createStubOnboardingConversation(): OnboardingConversationAdapter {
  return {
    async composeNextPrompt(input) {
      return {
        kind: "ok",
        value: {
          assistantMessage:
            input.missingFields.length === 0
              ? "등록할 정보를 모두 확인했어요."
              : "전화번호와 영업시간을 알려주세요.",
          nextState:
            input.missingFields.length === 0
              ? "profile_summary"
              : "slot_elicitation",
        },
      }
    },
    async extractStoreSlots(input): Promise<
      AdapterResult<OnboardingConversationOutput>
    > {
      return {
        kind: "ok",
        value: extractOnboardingSlots(input),
      }
    },
  }
}

export function createStubPostingConversation(): PostingConversationAdapter {
  return {
    async classifyOwnerReply(input) {
      return {
        kind: "ok",
        value: classifyPostingReply(input),
      }
    },
  }
}
