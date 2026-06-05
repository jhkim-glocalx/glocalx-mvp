export type AppShellCopy = {
  readonly productName: string
  readonly initialPrompt: string
  readonly supportingText: string
  readonly primaryAction: string
  readonly secondaryAction: string
}

export const appShellCopy = {
  productName: "GlocalX",
  initialPrompt: "혼자서도 전 세계에 팝니다.",
  supportingText:
    "네이버 매장 정보 추출, Google Business Profile 준비, GBP 홍보글 초안과 게시를 한 흐름으로 연결합니다.",
  primaryAction: "데모 시작",
  secondaryAction: "준비중",
} satisfies AppShellCopy
