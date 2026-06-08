import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import Home from "./page"

describe("login landing page", () => {
  it("renders the Korean login choices with form actions", () => {
    const html = renderToStaticMarkup(<Home />)

    expect(html).toContain("GlocalX")
    expect(html).toContain("내 가게, 세계로")
    expect(html).toContain("혼자서도")
    expect(html).toContain("시작하기")
    expect(html).toContain('action="/api/auth/google/start"')
    expect(html).toContain("Google로 계속하기")
    expect(html).toContain('action="/api/auth/kakao/start"')
    expect(html).toContain("카카오로 계속하기")
    expect(html).toContain("또는")
    expect(html).toContain('name="email"')
    expect(html).toContain('placeholder="이메일 주소"')
    expect(html).toContain('action="/api/auth/demo-login"')
    expect(html).toContain("이메일로 계속하기")
    expect(html).toContain("서비스 이용약관 및 개인정보처리방침")
    expect(html).not.toContain("화면구조도")
    expect(html).not.toContain("기능정의서 매핑")
    expect(html).not.toContain("step rail")
    expect(html).not.toContain("prototype frame")
  })
})
