import { expect, test } from "@playwright/test"

import { adminBaseUrl, e2eAdminEmail, e2eAdminPassword } from "./harness"

// Phase 3 task 7: the operator surface for organization publishing credentials.
// The demo seed ships a google_org credential (so campaign GBP publishing works
// in stub mode) and no meta_app one — which is exactly the two states the panel
// has to tell apart.
test("an operator sees credential status and can save a new one", async ({
  browser,
}) => {
  const operatorContext = await browser.newContext({ baseURL: adminBaseUrl })
  const operatorPage = await operatorContext.newPage()
  await operatorPage.goto(`${adminBaseUrl}/login`)
  await operatorPage.getByLabel("이메일").fill(e2eAdminEmail)
  await operatorPage.getByLabel("비밀번호").fill(e2eAdminPassword)
  await operatorPage.getByRole("button", { name: "로그인" }).click()
  await operatorPage.goto(`${adminBaseUrl}/settings`)

  await expect(
    operatorPage.getByTestId("credential-status-google_org")
  ).toHaveText("Linked")
  await expect(
    operatorPage.getByTestId("credential-status-meta_app")
  ).toHaveText("Not configured")

  await operatorPage.getByTestId("credential-provider").selectOption("meta_app")
  await operatorPage
    .getByTestId("credential-token")
    .fill("operator-pasted-token")
  await operatorPage
    .getByTestId("credential-scopes")
    .fill("instagram_content_publish")
  await operatorPage.getByTestId("credential-save").click()

  await expect(operatorPage.getByTestId("credential-saved")).toBeVisible()
  await expect(
    operatorPage.getByTestId("credential-status-meta_app")
  ).toHaveText("Linked")

  // The pasted secret is cleared from the form the moment the save lands, so a
  // shared operator screen isn't left displaying it.
  await expect(operatorPage.getByTestId("credential-token")).toHaveValue("")

  // Nothing the panel renders carries token material, before or after a save.
  await expect(operatorPage.locator("body")).not.toContainText(
    "operator-pasted-token"
  )

  // The credential survives a reload — it was persisted, not just held in state.
  await operatorPage.reload()
  await expect(
    operatorPage.getByTestId("credential-status-meta_app")
  ).toHaveText("Linked")

  await operatorContext.close()
})
