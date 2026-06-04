export type AppShellCopy = {
  readonly productName: string
  readonly initialPrompt: string
  readonly supportingText: string
  readonly primaryAction: string
  readonly secondaryAction: string
}

export const appShellCopy = {
  productName: "GlocalX",
  initialPrompt: "글로컬 매장 운영을 시작합니다",
  supportingText:
    "네이버 매장 정보 추출, Google Business Profile 준비, 홍보글과 리뷰 관리를 한 흐름으로 연결합니다.",
  primaryAction: "데모 시작",
  secondaryAction: "준비 상태 보기",
} satisfies AppShellCopy
