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
import {
  fileInputFrom,
  hasField,
  installPostingFetch,
  readImageAssets,
  readNumberField,
  readStringField,
  sizedImageFile,
  twentyMbBytes,
} from "./app-workspace-test-support"

describe("app workspace image asset uploads", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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
    fireEvent.click(screen.getByRole("button", { name: "홍보 콘텐츠 넣기" }))
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
      screen.getByRole("button", { name: "홍보 문구 분석 및 사진 보정" })
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
    fireEvent.click(screen.getByRole("button", { name: "홍보 콘텐츠 넣기" }))

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
