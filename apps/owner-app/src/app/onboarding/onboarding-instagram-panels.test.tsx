import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { InstagramConnectResultPanel } from "./onboarding-instagram-panels"

describe("InstagramConnectResultPanel", () => {
  it("confirms the connected account by name, with no retry offered", () => {
    // Given
    const html = renderToStaticMarkup(
      <InstagramConnectResultPanel
        linkedAccountUsername="bar_seomyeon"
        requestedAccountHandle="bar_seomyeon"
        result="connected"
      />
    )

    // Then
    expect(html).toContain("인스타그램 계정을 연결했어요")
    expect(html).toContain("@bar_seomyeon")
    expect(html).toContain("매장 홍보 처음 시키러 가기")
    expect(html).not.toContain("다시 연결")
  })

  it("surfaces a different-account connect as a question, pre-filled for retry", () => {
    // Given
    const html = renderToStaticMarkup(
      <InstagramConnectResultPanel
        linkedAccountUsername="other_account"
        requestedAccountHandle="bar_seomyeon"
        result="connected_other_account"
      />
    )

    // Then
    expect(html).toContain("다른 인스타그램 계정으로 로그인하셨어요")
    // The owner sees which account they actually landed on...
    expect(html).toContain("@other_account")
    // ...and the retry field remembers the one they asked for.
    expect(html).toContain('value="bar_seomyeon"')
    expect(html).toContain('role="alert"')
  })

  it("explains the professional-account requirement instead of failing", () => {
    // Given
    const html = renderToStaticMarkup(
      <InstagramConnectResultPanel
        linkedAccountUsername={undefined}
        requestedAccountHandle="bar_seomyeon"
        result="needs_professional_account"
      />
    )

    // Then
    expect(html).toContain("프로페셔널(비즈니스) 계정으로 전환")
    expect(html).toContain("전환 후 다시 연결")
  })

  it("always offers the way out, even when the connect failed", () => {
    // Given
    const html = renderToStaticMarkup(
      <InstagramConnectResultPanel
        linkedAccountUsername={undefined}
        requestedAccountHandle={undefined}
        result="error"
      />
    )

    // Then — a failed Instagram connect must not strand an owner whose GBP
    // setup already succeeded.
    expect(html).toContain("매장 홍보 처음 시키러 가기")
    expect(html).toContain("다시 연결")
    // Nothing to name, so no account card is rendered at all.
    expect(html).not.toContain("연결된 인스타그램 계정")
  })
})
