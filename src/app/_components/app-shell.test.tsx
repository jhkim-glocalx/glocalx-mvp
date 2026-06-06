import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ActionChip } from "./action-chip"
import { BottomNav } from "./bottom-nav"
import { ChatMessage } from "./chat-message"
import { MobileShell } from "./mobile-shell"
import { StatusCard } from "./status-card"

const navItems = [
  { id: "onboarding", label: "온보딩" },
  { id: "post", label: "포스팅" },
] as const

describe("app shell primitives", () => {
  it("marks the active bottom tab inside the mobile shell", () => {
    const html = renderToStaticMarkup(
      <MobileShell
        bottomNav={
          <BottomNav
            activeId="post"
            items={navItems}
            onSelect={() => undefined}
          />
        }
        testId="app-stage"
        topBar={<span>포스팅 작업실</span>}
      >
        <p>작업실 본문</p>
      </MobileShell>
    )

    expect(html).toContain('data-testid="app-stage"')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain("포스팅")
  })

  it("renders disabled action chips as unavailable actions", () => {
    const html = renderToStaticMarkup(
      <ActionChip disabled label="인스타그램 연동 준비중" />
    )

    expect(html).toContain("disabled")
    expect(html).toContain("인스타그램 연동 준비중")
  })

  it("renders owner and assistant chat messages", () => {
    const html = renderToStaticMarkup(
      <>
        <ChatMessage message="가게 정보를 찾았어요" speaker="assistant" />
        <ChatMessage message="주말 브런치 신메뉴 홍보" speaker="owner" />
      </>
    )

    expect(html).toContain("가게 정보를 찾았어요")
    expect(html).toContain("주말 브런치 신메뉴 홍보")
  })

  it("renders status-card variants with stable labels", () => {
    const html = renderToStaticMarkup(
      <StatusCard label="GBP 준비" status="warning" value="인증 대기" />
    )

    expect(html).toContain('data-status="warning"')
    expect(html).toContain("인증 대기")
  })
})
