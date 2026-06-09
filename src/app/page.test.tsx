import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { authErrorMessageFor, HomeView } from "./page"

describe("login landing page", () => {
  it("renders the Korean login choices with form actions", () => {
    const html = renderToStaticMarkup(<HomeView />)

    expect(html).toContain("혼자서도")
    expect(html).toContain("전 세계에 팝니다.")
    expect(html).toContain("하루 천원대로 우리도 마케팅 직원 쓰자구요.")
    expect(html).toContain('action="/api/auth/kakao/start"')
    expect(html).toContain("카카오로 3초 시작")
    expect(html).toContain('action="/api/auth/google/start"')
    expect(html).toContain("구글로 시작")
    expect(html).toContain('action="/api/auth/demo-login"')
    expect(html).toContain("이메일로 시작")
    expect(html).toContain("이용약관 및 개인정보처리방침")
    expect(html).toContain("FT-01 회원가입")
    expect(html).not.toContain("화면구조도")
    expect(html).not.toContain("기능정의서 매핑")
    expect(html).not.toContain("step rail")
    expect(html).not.toContain("prototype frame")
  })

  it("maps Kakao client secret errors to a specific login message", () => {
    const message = authErrorMessageFor("kakao_client_secret")
    const html = renderToStaticMarkup(<HomeView authErrorMessage={message} />)

    expect(html).toContain("카카오 Client Secret이 필요합니다.")
    expect(html).toContain("role=\"alert\"")
  })
})
