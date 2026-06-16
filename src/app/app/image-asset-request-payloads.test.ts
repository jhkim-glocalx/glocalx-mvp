import { describe, expect, it } from "vitest"

import type { MarketingImageAsset } from "./app-workspace-model"
import { imageAssetRequestPayloads } from "./image-asset-request-payloads"

const localAsset = {
  dataUrl: "data:image/png;base64,local-original",
  id: "asset-menu",
  mimeType: "image/png",
  name: "menu.png",
  sizeBytes: 20_000_000,
} satisfies MarketingImageAsset

describe("imageAssetRequestPayloads", () => {
  it("strips local-only preview data from post request image assets", () => {
    const [payload] = imageAssetRequestPayloads([localAsset])

    expect(payload).toEqual({
      id: "asset-menu",
      mimeType: "image/png",
      name: "menu.png",
      sizeBytes: 20_000_000,
    })
  })

  it("sends the compressed request data URL when one is available", () => {
    const [payload] = imageAssetRequestPayloads([
      {
        ...localAsset,
        requestDataUrl: "data:image/jpeg;base64,compressed",
        requestMimeType: "image/jpeg",
      },
    ])

    expect(payload).toEqual({
      dataUrl: "data:image/jpeg;base64,compressed",
      id: "asset-menu",
      mimeType: "image/jpeg",
      name: "menu.png",
      sizeBytes: 20_000_000,
    })
  })
})
