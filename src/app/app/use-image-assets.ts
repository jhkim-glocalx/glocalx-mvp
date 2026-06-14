"use client"

import { useState } from "react"

import type { MarketingImageAsset } from "./app-workspace-model"

type UseImageAssetsOptions = {
  readonly onImagesSelected: () => void
  readonly onInvalidImage: (message: string) => void
}

const maxImageBytes = 1_200_000

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }
      reject(new Error("이미지를 읽지 못했습니다."))
    })
    reader.addEventListener("error", () => reject(reader.error))
    reader.readAsDataURL(file)
  })
}

function isSupportedImageType(
  mimeType: string
): mimeType is MarketingImageAsset["mimeType"] {
  return (
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/webp"
  )
}

function readSupportedImageMimeType(
  file: File
): MarketingImageAsset["mimeType"] {
  if (isSupportedImageType(file.type)) {
    return file.type
  }

  throw new Error("JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.")
}

export function useImageAssets({
  onImagesSelected,
  onInvalidImage,
}: UseImageAssetsOptions) {
  const [imageAssets, setImageAssets] = useState<
    readonly MarketingImageAsset[]
  >([])

  async function handleImageFiles(files: FileList | null): Promise<void> {
    if (files === null || files.length === 0) {
      return
    }

    const selectedFiles = Array.from(files).slice(0, 4)
    const unsupportedFile = selectedFiles.find(
      (file) => !isSupportedImageType(file.type)
    )
    if (unsupportedFile !== undefined) {
      onInvalidImage("JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.")
      return
    }

    const oversizedFile = selectedFiles.find(
      (file) => file.size > maxImageBytes
    )
    if (oversizedFile !== undefined) {
      onInvalidImage("이미지는 장당 1.2MB 이하로 올려주세요.")
      return
    }

    const nextAssets = await Promise.all(
      selectedFiles.map(async (file, index) => ({
        dataUrl: await readFileAsDataUrl(file),
        id: `asset-${file.name}-${file.lastModified}-${index}`,
        mimeType: readSupportedImageMimeType(file),
        name: file.name,
        sizeBytes: file.size,
      }))
    )
    setImageAssets(nextAssets)
    onImagesSelected()
  }

  return {
    handleImageFiles,
    imageAssets,
  }
}
