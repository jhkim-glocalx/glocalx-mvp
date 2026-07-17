import type { MarketingImageAsset } from "./app-workspace-model"

export function imageAssetRequestPayloads(
  imageAssets: readonly MarketingImageAsset[]
) {
  return imageAssets.map((asset) => {
    const mimeType = asset.requestMimeType ?? asset.mimeType
    return {
      ...(asset.requestDataUrl === undefined
        ? {}
        : { dataUrl: asset.requestDataUrl }),
      id: asset.id,
      mimeType,
      name: asset.name,
      sizeBytes: asset.sizeBytes,
    }
  })
}
