import { expect, test } from "@playwright/test"

import {
  adminBaseUrl,
  e2eAdminEmail,
  e2eAdminPassword,
  ownerBaseUrl,
} from "./harness"

test("both apps boot against the shared stub database", async ({ request }) => {
  const ownerResponse = await request.get(`${ownerBaseUrl}/`)
  expect(ownerResponse.ok()).toBe(true)

  const healthResponse = await request.get(`${adminBaseUrl}/api/health`)
  expect(await healthResponse.json()).toEqual({
    ok: true,
    service: "glocalx-admin",
  })
})

test("admin login round-trips through the seeded operator", async ({
  page,
}) => {
  await page.goto("/login")
  await page.getByLabel("이메일").fill(e2eAdminEmail)
  await page.getByLabel("비밀번호").fill(e2eAdminPassword)
  await page.getByRole("button", { name: "로그인" }).click()

  await expect(page).toHaveURL(/\/stores/)
  await expect(page.getByRole("heading", { name: "Stores" })).toBeVisible()
  await expect(page.getByText("E2E Operator")).toBeVisible()
})

test("owner and admin sessions cannot cross apps", async ({
  browser,
  request,
}) => {
  // Mint a real owner session via the test-only demo login.
  const demoLogin = await request.post(`${ownerBaseUrl}/api/auth/demo-login`, {
    maxRedirects: 0,
  })
  expect(demoLogin.status()).toBe(303)
  const ownerCookie = demoLogin
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value)
    .find((value) => value.startsWith("glocalx_session="))
  const ownerSessionId = ownerCookie?.split(";")[0]?.split("=")[1]
  expect(ownerSessionId).toBeTruthy()

  // An owner session id presented as the admin cookie must not grant ops
  // access…
  const ownerAsAdminContext = await browser.newContext()
  await ownerAsAdminContext.addCookies([
    {
      name: "glocalx_admin_session",
      value: ownerSessionId ?? "",
      url: adminBaseUrl,
    },
  ])
  const adminPage = await ownerAsAdminContext.newPage()
  await adminPage.goto(`${adminBaseUrl}/stores`)
  await expect(adminPage).toHaveURL(/\/login/)
  await ownerAsAdminContext.close()

  // …and an admin session id presented as the owner cookie must not grant
  // owner access.
  const loginResponse = await request.post(`${adminBaseUrl}/api/auth/login`, {
    form: { email: e2eAdminEmail, password: e2eAdminPassword },
    headers: { origin: adminBaseUrl },
    maxRedirects: 0,
  })
  expect(loginResponse.status()).toBe(303)
  const adminCookie = loginResponse
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => header.value)
    .find((value) => value.startsWith("glocalx_admin_session="))
  const adminSessionId = adminCookie?.split(";")[0]?.split("=")[1]
  expect(adminSessionId).toBeTruthy()

  const adminAsOwnerContext = await browser.newContext()
  await adminAsOwnerContext.addCookies([
    {
      name: "glocalx_session",
      value: adminSessionId ?? "",
      url: ownerBaseUrl,
    },
  ])
  const ownerPage = await adminAsOwnerContext.newPage()
  await ownerPage.goto(`${ownerBaseUrl}/app`)
  await expect(ownerPage).not.toHaveURL(/\/app/)
  await adminAsOwnerContext.close()
})
