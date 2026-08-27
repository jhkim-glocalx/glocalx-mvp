import { AxeBuilder } from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

import {
  assertPageOverflowContract,
  assertSeededRouteState,
  loginAsAdmin,
  responsiveRoutes,
} from "./responsive-fixtures"

test.describe("responsive Admin route matrix", () => {
  test.use({ colorScheme: "dark" })

  for (const route of responsiveRoutes) {
    test(`${route.name} renders its seeded state without page overflow`, async ({
      page,
    }, testInfo) => {
      await loginAsAdmin(page)
      await page.goto(route.path)
      await expect(
        page.getByRole("heading", { name: route.heading })
      ).toBeVisible()
      await assertSeededRouteState(page, route.name)
      await assertPageOverflowContract(page)

      const screenshotName = `${testInfo.project.name}/${route.name}/initial.png`
      await page.screenshot({
        path: testInfo.outputPath(screenshotName),
        fullPage: true,
        animations: "disabled",
      })

      const axe = await new AxeBuilder({ page }).analyze()
      const blockingViolations = axe.violations.filter(
        (violation) =>
          violation.impact === "critical" || violation.impact === "serious"
      )
      expect(blockingViolations, "serious/critical axe violations").toEqual([])
    })
  }
})

test.describe("responsive shell interactions", () => {
  test("compact and medium navigation drawer exposes an accessible lifecycle", async ({
    page,
  }) => {
    test.skip(!/^compact-|^medium-/.test(test.info().project.name))
    await loginAsAdmin(page)

    const menuButton = page.getByRole("button", { name: /메뉴|탐색|사이드바/i })
    await expect(menuButton).toHaveAttribute("aria-expanded", "false")
    const controlledId = await menuButton.getAttribute("aria-controls")
    expect(controlledId).toBeTruthy()

    await menuButton.click()
    const drawer = page.locator(`#${controlledId}`)
    await expect(drawer).toBeVisible()
    await expect(drawer).toHaveAttribute("aria-label", /.+/)
    await expect(menuButton).toHaveAttribute("aria-expanded", "true")

    await page.keyboard.press("Escape")
    await expect(drawer).toBeHidden()
    await expect(menuButton).toBeFocused()

    await menuButton.click()
    await drawer.getByRole("link", { name: "인박스" }).click()
    await expect(page).toHaveURL(/\/inbox$/)
    await expect(drawer).toBeHidden()
  })

  test("expanded navigation stays persistent", async ({ page }) => {
    test.skip(!test.info().project.name.startsWith("expanded-"))
    await loginAsAdmin(page)
    await expect(page.locator(".ops-sidebar")).toBeVisible()
    await expect(page.getByRole("link", { name: "설정" })).toBeVisible()
  })
})

test.describe("responsive operator task states", () => {
  test("Inbox can enter detail and preserve editable reply state", async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto("/inbox")
    const firstConversation = page
      .locator('[aria-label="대화 목록"] .ops-inbox-item')
      .first()
    await firstConversation.click()
    await expect(page.getByTestId("inbox-detail")).toBeVisible()

    const reply = page.getByLabel("답장")
    await reply.fill("responsive verification draft")
    await expect(reply).toHaveValue("responsive verification draft")

    if (/^compact-/.test(test.info().project.name)) {
      const back = page.getByRole("button", { name: /목록|뒤로/i })
      await expect(back).toBeVisible()
      await back.click()
      await expect(
        page.getByRole("button", { name: /목록|뒤로/i })
      ).toBeHidden()
      await firstConversation.click()
      await expect(reply).toHaveValue("responsive verification draft")
    }
  })

  test("Queue owns horizontal overflow locally", async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto("/queue")
    await expect(page.getByRole("heading", { name: "대기열" })).toBeVisible()
    await assertPageOverflowContract(page)

    const board = page.getByRole("region", { name: /캠페인 요청/ })
    await expect(board).toBeVisible()
    if (/^(compact|medium)-/.test(test.info().project.name)) {
      await expect
        .poll(() =>
          board.evaluate((element) => element.scrollWidth > element.clientWidth)
        )
        .toBe(true)
      await board.focus()
      await page.keyboard.press("ArrowRight")
      await expect(board).toBeFocused()
    }
  })
})
