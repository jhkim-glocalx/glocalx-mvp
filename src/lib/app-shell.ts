export type AppShellCopy = {
  readonly productName: string
  readonly initialPrompt: string
  readonly supportingText: string
  readonly primaryAction: string
  readonly secondaryAction: string
}

export const appShellCopy = {
  productName: "GlocalX",
  initialPrompt: "오늘의 매장",
  supportingText: "가게 연결, GBP 확인, 첫 게시글",
  primaryAction: "시작하기",
  secondaryAction: "준비중",
} satisfies AppShellCopy
