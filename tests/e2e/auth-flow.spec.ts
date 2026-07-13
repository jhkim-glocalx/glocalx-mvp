import { expect, test } from "@playwright/test"

import { resetFirstTimeE2eDatabase } from "./db-harness"

test.beforeEach(async () => {
  await resetFirstTimeE2eDatabase()
})

test("First-time email registration creates an account and routes to onboarding", async ({
  page,
}) => {
  await page.context().clearCookies()
  await page.goto("/")

  await page.getByRole("button", { name: "이메일로 시작" }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.getByRole("link", { name: "회원가입" }).click()
  await page.getByRole("textbox", { name: "이름" }).fill("글로컬 사장님")
  await page.getByRole("textbox", { name: "이메일" }).fill("owner@example.com")
  await page.getByLabel("비밀번호").fill("correct-horse-battery-staple")
  await page.getByRole("button", { name: "이메일로 회원가입" }).click()

  await expect(page).toHaveURL(/\/onboarding/)
  await expect(page.getByText("네이버플레이스 링크나 상호명")).toBeVisible()
})

test("Kakao login shows a configuration error instead of creating a demo session", async ({
  page,
}) => {
  await page.context().clearCookies()
  await page.goto("/")

  await page.getByRole("button", { name: "카카오로 3초 시작" }).click()

  await expect(page).toHaveURL(/auth_error=kakao_config/)
  await expect(page.locator(".gx-auth-error")).toContainText(
    "카카오 로그인 설정"
  )

  const cookies = await page.context().cookies()
  expect(cookies.some((cookie) => cookie.name === "glocalx_demo_session")).toBe(
    false
  )
  expect(cookies.some((cookie) => cookie.name === "glocalx_demo_store")).toBe(
    false
  )
})

test("Google login shows a configuration error instead of creating a demo session", async ({
  page,
}) => {
  await page.context().clearCookies()
  await page.goto("/")

  await page.getByRole("button", { name: "구글로 시작" }).click()

  await expect(page).toHaveURL(/auth_error=google_config/)
  await expect(page.locator(".gx-auth-error")).toContainText("구글 로그인 설정")

  const cookies = await page.context().cookies()
  expect(cookies.some((cookie) => cookie.name === "glocalx_demo_session")).toBe(
    false
  )
  expect(cookies.some((cookie) => cookie.name === "glocalx_demo_store")).toBe(
    false
  )
})

test("Returning email login routes to the chat dashboard", async ({ page }) => {
  await page.context().clearCookies()
  await page.goto("/")
  await page.getByRole("button", { name: "이메일로 시작" }).click()
  await page.getByRole("link", { name: "회원가입" }).click()
  await page.getByRole("textbox", { name: "이름" }).fill("글로컬 사장님")
  await page.getByRole("textbox", { name: "이메일" }).fill("owner@example.com")
  await page.getByLabel("비밀번호").fill("correct-horse-battery-staple")
  await page.getByRole("button", { name: "이메일로 회원가입" }).click()
  await page
    .getByRole("textbox", { name: "네이버 정보", exact: true })
    .fill("https://naver.me/mybrunchcafe")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()
  await expect(page.getByText("브런치모먼트 홍대점")).toBeVisible()
  await page.getByRole("button", { exact: true, name: "예, 맞아요" }).click()
  await page
    .getByRole("textbox", { name: "네이버 정보", exact: true })
    .fill("평일 9-6이에요")
  await page.getByRole("button", { name: "네이버 정보 제출" }).click()
  await expect(page.getByRole("textbox", { name: "영업시간" })).toHaveValue(
    "평일 09:00-18:00"
  )
  await page.getByRole("button", { name: "예, 맞아요" }).click()
  await expect(
    page.getByRole("button", { name: "다음: GBP 세팅 확인" })
  ).toBeVisible()
  await page.getByRole("button", { name: "다음: GBP 세팅 확인" }).click()
  await expect(page.getByText("인증 대기", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "매장 홍보 처음 시키러 가기" }).click()

  await expect(page).toHaveURL(/\/app\?nav=photo/)
  await expect(
    page.getByRole("button", { name: "홍보 콘텐츠 넣기" })
  ).toHaveAttribute("aria-current", "page")
  await expect(page.getByText("홍보를 하기위해 최소한의 사진")).toBeVisible()

  await page.goto("/")
  await page.getByRole("button", { name: "이메일로 시작" }).click()
  await page.getByRole("textbox", { name: "이메일" }).fill("owner@example.com")
  await page.getByLabel("비밀번호").fill("correct-horse-battery-staple")
  await page.getByRole("button", { name: "이메일로 로그인" }).click()

  await expect(page).toHaveURL(/\/app/)
  await expect(
    page.getByRole("heading", { name: "홍보 실적 자세히 보기" })
  ).toBeVisible()
})

test("auth entry does not create a session before a form is submitted", async ({
  page,
}) => {
  await page.context().clearCookies()
  await page.goto("/")

  await expect(page.getByTestId("entry-device")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "이메일로 시작" })
  ).toBeEnabled()

  const cookies = await page.context().cookies()
  expect(cookies.some((cookie) => cookie.name === "glocalx_demo_session")).toBe(
    false
  )
})

test("Protected app route redirects unauthenticated visitors to login", async ({
  page,
}) => {
  await page.context().clearCookies()

  await page.goto("/app")

  await expect(page).toHaveURL("/")
  await expect(
    page.getByRole("heading", { name: /혼자서도\s*전 세계에 팝니다\./ })
  ).toBeVisible()
})
