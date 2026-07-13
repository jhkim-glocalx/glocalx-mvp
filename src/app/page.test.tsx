import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import Home from "./page"

describe("login landing page", () => {
  it("renders the Korean login choices with form actions", async () => {
    const view = await Home({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({}),
    })
    const html = renderToStaticMarkup(view)

    expect(html).toContain("혼자서도")
    expect(html).toContain("전 세계에 팝니다.")
    expect(html).toContain("하루 천원대로 우리도 마케팅 직원 쓰자구요.")
    expect(html).toContain('action="/api/auth/kakao/start"')
    expect(html).toContain("카카오로 3초 시작")
    expect(html).toContain('action="/api/auth/google/start"')
    expect(html).toContain("구글로 시작")
    expect(html).toContain('action="/login"')
    expect(html).toContain("이메일로 시작")
    expect(html).toContain("이용약관 및 개인정보처리방침")
    expect(html).toContain("소셜 계정 또는 이메일로 안전하게 시작할 수 있어요.")
    expect(html).not.toContain("화면구조도")
    expect(html).not.toContain("기능정의서 매핑")
    expect(html).not.toContain("step rail")
    expect(html).not.toContain("prototype frame")
  })

  it("maps Kakao client secret errors to a specific login message", async () => {
    const view = await Home({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({
        auth_error: "kakao_client_secret",
      }),
    })
    const html = renderToStaticMarkup(view)

    expect(html).toContain("카카오 Client Secret이 필요합니다.")
    expect(html).toContain('role="alert"')
  })

  it("maps Google state errors to a visible login message", async () => {
    const view = await Home({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({
        auth_error: "google_state",
      }),
    })
    const html = renderToStaticMarkup(view)

    expect(html).toContain("구글 로그인 세션이 만료되었습니다.")
    expect(html).toContain('role="alert"')
  })

  it("asks email owners to authenticate before linking social login", async () => {
    const view = await Home({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({
        auth_error: "account_link_required",
      }),
    })
    const html = renderToStaticMarkup(view)

    expect(html).toContain(
      "이메일로 로그인한 뒤 소셜 계정을 다시 연결해주세요."
    )
    expect(html).toContain('role="alert"')
  })
})
