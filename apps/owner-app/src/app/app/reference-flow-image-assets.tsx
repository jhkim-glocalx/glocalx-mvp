"use client"

/* eslint-disable @next/next/no-img-element */

import type {
  DraftImagePreview,
  MarketingImageAsset,
} from "./app-workspace-model"

export function AssetThumbs({
  imageAssets,
}: {
  readonly imageAssets: readonly MarketingImageAsset[]
}) {
  if (imageAssets.length === 0) {
    return (
      <div className="gx-upload-empty">
        <strong>사진 자리</strong>
        <span>메뉴, 매장, 자랑하고 싶은 포인트 사진을 올릴 수 있습니다.</span>
      </div>
    )
  }

  return (
    <div className="gx-upload-grid" aria-label="업로드된 이미지">
      {imageAssets.map((asset) => (
        <figure key={asset.id}>
          <img alt={asset.name} src={asset.dataUrl} />
          <figcaption>{asset.name}</figcaption>
        </figure>
      ))}
    </div>
  )
}

export function ImageComparison({
  image,
  imageAssets,
}: {
  readonly image: DraftImagePreview
  readonly imageAssets: readonly MarketingImageAsset[]
}) {
  const asset = imageAssets.find((candidate) => candidate.id === image.assetId)
  const originalSrc = asset?.dataUrl
  const editedSrc = image.editedDataUrl ?? originalSrc

  return (
    <div className="gx-image-compare gx-image-compare-live">
      <figure>
        {originalSrc === undefined ? null : (
          <img alt={`${image.originalLabel} 원본`} src={originalSrc} />
        )}
        <figcaption>
          <span>원본</span>
          <strong>{image.originalLabel}</strong>
        </figcaption>
      </figure>
      <figure>
        {editedSrc === undefined ? null : (
          <img
            alt={image.altText}
            src={editedSrc}
            style={{
              filter:
                image.editedDataUrl === null ? image.cssFilter : undefined,
            }}
          />
        )}
        <figcaption>
          <span>{image.editedLabel}</span>
          <strong>
            {image.qualityScore}점 · {image.cropFocus}
          </strong>
        </figcaption>
      </figure>
      <p>{image.editSummary}</p>
    </div>
  )
}
