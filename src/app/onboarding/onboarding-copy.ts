const storeProfileConfirmationReplies: ReadonlySet<string> = new Set([
  "예",
  "네",
  "넵",
  "응",
  "맞아요",
  "맞습니다",
  "예맞아요",
  "네맞아요",
])

export const storeSearchAgainPrompt =
  "다시 찾을 상호명이나 네이버 링크를 입력해주세요."

export function isStoreProfileConfirmationMessage(message: string): boolean {
  const normalizedMessage = message
    .trim()
    .replace(/[\s,，.!?~…。！？]+/g, "")
  return storeProfileConfirmationReplies.has(normalizedMessage)
}
