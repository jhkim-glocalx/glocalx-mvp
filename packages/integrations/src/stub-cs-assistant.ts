import type {
  CsAssistantAdapter,
  CsAssistantComposeInput,
} from "./cs-assistant-contracts"

// A deterministic, credential-free reply so AI-mode chat is fully demoable in
// stub mode. Keyed off the section the owner sent from so an operator (and a
// test) can see the reply is context-aware without any live model call. Korean
// to match the owner app's voice. Purely a function of the input — same input,
// same reply — which is what the AI-mode acceptance test asserts.
const sectionReplies: Readonly<Record<string, string>> = {
  home: "안녕하세요! 무엇을 도와드릴까요? 매장 홍보나 설정 관련해서 편하게 말씀해 주세요.",
  gbp_connect:
    "구글 비즈니스 프로필 연결을 도와드릴게요. 화면에 보이는 ‘연결’ 버튼을 눌러 로그인하시면 다음 단계로 안내해 드립니다.",
  onboarding:
    "매장 정보를 확인하는 중이시군요. 막히는 부분을 알려주시면 함께 채워볼게요.",
  marketing:
    "홍보물 준비를 도와드릴게요. 올리고 싶은 사진과 알리고 싶은 내용을 보내주시면 검토해 드립니다.",
  performance:
    "성과 지표는 곧 제공될 예정이에요. 지금은 게시물 작성과 발행을 도와드릴 수 있어요.",
}

const fallbackReply =
  "말씀 주셔서 감사합니다. 내용을 확인하고 이어서 도와드릴게요."

export function composeStubCsReply(input: CsAssistantComposeInput): string {
  return sectionReplies[input.currentSection] ?? fallbackReply
}

export function createStubCsAssistant(): CsAssistantAdapter {
  return {
    async composeReply(input) {
      return { kind: "ok", value: { reply: composeStubCsReply(input) } }
    },
  }
}
