// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AppWorkspace } from "./app-workspace"

const draftResponse = {
  draftId: "draft-original",
  preview: {
    koreanCopy: "이번 주말 브런치 신메뉴를 만나보세요.",
    platformPreviews: [
      {
        copy: "이번 주말 브런치 신메뉴를 만나보세요.",
        platform: "GBP",
      },
    ],
    suggestion: {
      id: "suggestion-1",
      message: "일본 관광객 타겟 문구를 더해보세요.",
      rationale: "최근 방문 비중이 높습니다.",
      revisedIntent: "일본 관광객에게 브런치 신메뉴 홍보",
      title: "타겟 문구 강화",
    },
  },
  status: "DRAFT_READY",
} as const

const revisedDraftResponse = {
  draftId: "draft-revised",
  preview: {
    koreanCopy: "일본 관광객에게 이번 주말 브런치 신메뉴를 소개합니다.",
    platformPreviews: [
      {
        copy: "일본 관광객에게 이번 주말 브런치 신메뉴를 소개합니다.",
        platform: "GBP",
      },
    ],
    suggestion: null,
  },
  status: "DRAFT_READY",
} as const

const postingDecisionResponse = {
  assistantMessage: "제안을 반영해 게시물 초안을 다시 만들었어요.",
  decision: "accepted",
  draft: revisedDraftResponse,
  revisedIntent: "일본 관광객에게 브런치 신메뉴 홍보",
  sessionId: "posting-session-1",
  status: "POSTING_CONVERSATION_TURN",
} as const

const twentyMbBytes = 20_000_000

function pathFromRequest(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input
  }

  if (input instanceof URL) {
    return input.pathname
  }

  return input.url
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readJsonRequestBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") {
    throw new Error("Expected a JSON request body.")
  }

  const payload: unknown = JSON.parse(init.body)
  return payload
}

function readImageAssets(payload: unknown): readonly unknown[] {
  if (!isRecord(payload) || !Array.isArray(payload["imageAssets"])) {
    throw new Error("Expected request payload with imageAssets.")
  }

  return payload["imageAssets"]
}

function readStringField(value: unknown, field: string): string {
  if (!isRecord(value)) {
    throw new Error(`Expected ${field} to be read from an object.`)
  }

  const fieldValue = value[field]
  if (typeof fieldValue !== "string") {
    throw new Error(`Expected ${field} to be a string.`)
  }

  return fieldValue
}

function readNumberField(value: unknown, field: string): number {
  if (!isRecord(value)) {
    throw new Error(`Expected ${field} to be read from an object.`)
  }

  const fieldValue = value[field]
  if (typeof fieldValue !== "number") {
    throw new Error(`Expected ${field} to be a number.`)
  }

  return fieldValue
}

function hasField(value: unknown, field: string): boolean {
  return isRecord(value) && field in value
}

function installPostingFetch(options?: {
  readonly onDraftRequest?: (payload: unknown) => void
}): void {
  const fetchMock: typeof fetch = async (input, init) => {
    const path = pathFromRequest(input)
    if (path === "/api/posts/drafts") {
      options?.onDraftRequest?.(readJsonRequestBody(init))
      return Response.json(draftResponse)
    }

    if (path === "/api/posts/conversation/decision") {
      return Response.json(postingDecisionResponse)
    }

    return Response.json(
      { message: `Unexpected request: ${path}`, status: "UNEXPECTED_REQUEST" },
      { status: 500 }
    )
  }

  vi.stubGlobal("fetch", fetchMock)
  vi.spyOn(window.crypto, "randomUUID").mockReturnValue("client-event-1")
}

function fileInputFrom(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected a file input in the photo workflow.")
  }

  return input
}

function sizedImageFile(options: {
  readonly name: string
  readonly sizeBytes: number
  readonly type: "image/jpeg" | "image/png" | "image/webp"
}): File {
  const file = new File(["image"], options.name, {
    lastModified: options.sizeBytes,
    type: options.type,
  })
  Object.defineProperty(file, "size", { value: options.sizeBytes })
  return file
}

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
      name: "성과 대시보드",
    })

    // Then: the dashboard is active and posting is available but inactive.
    expect(screen.getByRole("heading", { name: "성과 대시보드" })).toBeVisible()
    expect(dashboardTab).toHaveAttribute("aria-current", "page")
    expect(
      screen.getByRole("button", { name: "다채널 포스팅" })
    ).not.toHaveAttribute("aria-current")
    expect(
      screen.queryByRole("textbox", { name: "메시지 입력" })
    ).not.toBeInTheDocument()
  })

  it("opens the posting workflow when the posting nav is clicked", () => {
    // Given: the completed workspace starts on the dashboard.
    render(<AppWorkspace storeId="demo-store" />)

    // When: the owner explicitly selects posting.
    fireEvent.click(screen.getByRole("button", { name: "다채널 포스팅" }))

    // Then: posting is active and the posting placeholder is visible.
    expect(
      screen.getByRole("button", { name: "다채널 포스팅" })
    ).toHaveAttribute("aria-current", "page")
    expect(screen.getByText(/이미지와 홍보 의도를 먼저 분석하면/)).toBeVisible()
  })

  it("switches to posting when a revised draft is returned", async () => {
    // Given: the owner has generated a draft with an actionable suggestion.
    installPostingFetch()
    const { container } = render(<AppWorkspace storeId="demo-store" />)
    fireEvent.click(screen.getByRole("button", { name: "사진 고도화" }))
    fireEvent.change(fileInputFrom(container), {
      target: {
        files: [new File(["image"], "brunch.png", { type: "image/png" })],
      },
    })
    await screen.findByText("brunch.png")
    fireEvent.click(
      screen.getByRole("button", { name: "AI 분석 및 이미지 개선" })
    )
    await screen.findByText("스마트 제안")

    // When: the suggestion response returns a revised draft.
    fireEvent.click(screen.getByRole("button", { name: "제안 반영" }))

    // Then: the workspace intentionally moves to posting for review.
    expect(
      await screen.findByText("완성된 게시물을 확인해주세요")
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "다채널 포스팅" })
    ).toHaveAttribute("aria-current", "page")
  })

  it("sends multiple selected images in one draft request including a 20MB image", async () => {
    // Given: the owner selects multiple supported images and one is exactly 20MB.
    const draftBodies: unknown[] = []
    installPostingFetch({
      onDraftRequest: (payload) => {
        draftBodies.push(payload)
      },
    })
    const { container } = render(<AppWorkspace storeId="demo-store" />)
    fireEvent.click(screen.getByRole("button", { name: "사진 고도화" }))
    fireEvent.change(fileInputFrom(container), {
      target: {
        files: [
          sizedImageFile({
            name: "hero.png",
            sizeBytes: twentyMbBytes,
            type: "image/png",
          }),
          sizedImageFile({
            name: "menu.webp",
            sizeBytes: 512_000,
            type: "image/webp",
          }),
        ],
      },
    })
    await screen.findByText("hero.png")
    expect(screen.getByText("menu.webp")).toBeVisible()

    // When: the owner requests AI analysis.
    fireEvent.click(
      screen.getByRole("button", { name: "AI 분석 및 이미지 개선" })
    )

    // Then: one draft request carries both image assets.
    await waitFor(() => expect(draftBodies).toHaveLength(1))
    const imageAssets = readImageAssets(draftBodies[0])
    expect(imageAssets).toHaveLength(2)
    expect(imageAssets.map((asset) => readStringField(asset, "name"))).toEqual([
      "hero.png",
      "menu.webp",
    ])
    expect(
      imageAssets.map((asset) => readNumberField(asset, "sizeBytes"))
    ).toEqual([twentyMbBytes, 512_000])
    expect(imageAssets.map((asset) => hasField(asset, "dataUrl"))).toEqual([
      false,
      false,
    ])
  })

  it("rejects images over 20MB with a Korean client message naming 20MB", async () => {
    // Given: the owner selects an otherwise supported image over 20MB.
    const draftBodies: unknown[] = []
    installPostingFetch({
      onDraftRequest: (payload) => {
        draftBodies.push(payload)
      },
    })
    const { container } = render(<AppWorkspace storeId="demo-store" />)
    fireEvent.click(screen.getByRole("button", { name: "사진 고도화" }))

    // When: the file input changes.
    fireEvent.change(fileInputFrom(container), {
      target: {
        files: [
          sizedImageFile({
            name: "too-large.png",
            sizeBytes: twentyMbBytes + 1,
            type: "image/png",
          }),
        ],
      },
    })

    // Then: the client blocks upload with the 20MB guidance.
    expect(
      await screen.findByText("이미지는 장당 20MB 이하로 올려주세요.")
    ).toBeVisible()
    expect(draftBodies).toHaveLength(0)
  })
})
