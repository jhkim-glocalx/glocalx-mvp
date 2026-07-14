// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { OnboardingFlow } from "./onboarding-flow"

function installScrollTo(): void {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  })
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo")
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("onboarding OAuth continuation", () => {
  it("automatically resumes the non-mutating GBP review once after Google OAuth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        accountDisplayName: "Owner GBP",
        accountName: "accounts/owner",
        address: "서울 마포구 와우산로 123",
        businessName: "브런치모먼트 홍대점",
        categoryDisplayName: "브런치 카페",
        categoryName: "categories/gcid:brunch_restaurant",
        languageCode: "ko",
        message: "등록 정보를 확인해주세요.",
        phone: "02-1234-5678",
        reviewToken: "review-token",
        storeCode: "demo-store",
        status: "REGISTRATION_REVIEW_REQUIRED",
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    installScrollTo()

    render(<OnboardingFlow resumeGbpSetup />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith("/api/gbp/setup", {
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(await screen.findByText("Owner GBP")).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "매장형 비즈니스로 GBP 등록 승인",
      })
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe("/onboarding")
    expect(window.location.search).toBe("")
  })

  it("lets the owner retry when automatic GBP setup fails", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Temporary Google API failure"))
      .mockResolvedValueOnce(
        Response.json({
          auditLogId: "retried-gbp-audit",
          status: "VERIFICATION_PENDING",
        })
      )
    vi.stubGlobal("fetch", fetchMock)
    installScrollTo()

    render(<OnboardingFlow resumeGbpSetup />)

    const retry = await screen.findByRole("button", {
      name: "GBP 세팅 다시 시도",
    })
    retry.click()

    expect(await screen.findByText("retried-gbp-audit")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
