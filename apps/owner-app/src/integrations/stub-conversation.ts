import type {
  OnboardingConversationAdapter,
  PostingConversationAdapter,
  PostingOwnerReplyInput,
} from "./conversation-contracts"
import type { AdapterResult } from "./contracts"
import type {
  OnboardingConversationOutput,
  PostingConversationDecision,
} from "@/conversations/contracts"
import { extractLocalOnboardingSlots } from "@glocalx/domain/conversation/onboarding-slot-extraction"

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
              ? "필요한 매장 정보를 확인했어요. 정보가 맞으면 ‘예’ 또는 ‘맞아요’라고 답해주세요."
              : "매장 정보를 찾았어요. 필요한 정보를 하나씩 확인할게요.",
          nextState:
            input.missingFields.length === 0
              ? "profile_summary"
              : "slot_elicitation",
        },
      }
    },
    async extractStoreSlots(
      input
    ): Promise<AdapterResult<OnboardingConversationOutput>> {
      return {
        kind: "ok",
        value: extractLocalOnboardingSlots(input),
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
