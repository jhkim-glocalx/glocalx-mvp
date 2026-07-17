// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppWorkspace } from "./app-workspace"
import {
  fileInputFrom,
  installPostingFetch,
} from "./app-workspace-test-support"

describe("app workspace default landing", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("renders the completed app landing on the dashboard first", () => {
    // Given: a completed owner session renders the app workspace.
    render(<AppWorkspace storeId="demo-store" />)

    // When: the workspace loads with its initial active section.
    const dashboardTab = screen.getByRole("button", {
      name: "홍보 실적 자세히 보기",
    })

    // Then: the dashboard is active and posting is available but inactive.
    expect(
      screen.getByRole("heading", { name: "홍보 실적 자세히 보기" })
    ).toBeVisible()
    expect(dashboardTab).toHaveAttribute("aria-current", "page")
    expect(
      screen.getByRole("button", { name: "여러 SNS 자동홍보" })
    ).not.toHaveAttribute("aria-current")
    expect(
      screen.queryByRole("textbox", { name: "메시지 입력" })
    ).not.toBeInTheDocument()
  })

  it("opens the posting workflow when the posting nav is clicked", () => {
    // Given: the completed workspace starts on the dashboard.
    render(<AppWorkspace storeId="demo-store" />)

    // When: the owner explicitly selects posting.
    fireEvent.click(screen.getByRole("button", { name: "여러 SNS 자동홍보" }))

    // Then: posting is active and the posting placeholder is visible.
    expect(
      screen.getByRole("button", { name: "여러 SNS 자동홍보" })
    ).toHaveAttribute("aria-current", "page")
    expect(
      screen.getByText(/사진과 알리고 싶은 말이나 단어를 먼저 분석하면/)
    ).toBeVisible()
  })

  it("can open directly on the marketing content workflow", () => {
    // Given: onboarding hands the owner to marketing material creation.
    render(<AppWorkspace initialNavId="photo" storeId="demo-store" />)

    // When: the workspace loads from the requested app section.
    const photoTab = screen.getByRole("button", {
      name: "홍보 콘텐츠 넣기",
    })

    // Then: the marketing content section is active immediately.
    expect(photoTab).toHaveAttribute("aria-current", "page")
    expect(screen.getByText(/홍보를 하기위해 최소한의 사진/)).toBeVisible()
  })

  it("switches to posting when a revised draft is returned", async () => {
    // Given: the owner has generated a draft with an actionable suggestion.
    installPostingFetch()
    const { container } = render(<AppWorkspace storeId="demo-store" />)
    fireEvent.click(screen.getByRole("button", { name: "홍보 콘텐츠 넣기" }))
    fireEvent.change(fileInputFrom(container), {
      target: {
        files: [new File(["image"], "brunch.png", { type: "image/png" })],
      },
    })
    await screen.findByText("brunch.png")
    fireEvent.click(
      screen.getByRole("button", { name: "홍보 문구 분석 및 사진 보정" })
    )
    await screen.findByText("방문을 늘리는 문구 제안")

    // When: the suggestion response returns a revised draft.
    fireEvent.click(screen.getByRole("button", { name: "제안 반영" }))

    // Then: the workspace intentionally moves to posting for review.
    expect(
      await screen.findByText("완성된 게시물을 확인해주세요")
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "여러 SNS 자동홍보" })
    ).toHaveAttribute("aria-current", "page")
  })
})
