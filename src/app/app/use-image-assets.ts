"use client"

import { useState } from "react"

import {
  postImageMaxBytes,
  postImageMaxCount,
  postImageRequestDataUrlMaxChars,
} from "@/domain/post-image-limits"

import type { MarketingImageAsset } from "./app-workspace-model"

type UseImageAssetsOptions = {
  readonly onImagesSelected: () => void
  readonly onInvalidImage: (message: string) => void
}

const requestImageMimeType = "image/jpeg"
const requestImageMaxDimension = 1600
const requestImageDimensions = [1600, 1200, 900, 720, 480] as const
const requestImageQualities = [0.82, 0.68, 0.54, 0.42] as const

function readBlobAsDataUrl(blob: Blob): Promise<string> {
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
    reader.readAsDataURL(blob)
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

function readCanvasContext(
  canvas: HTMLCanvasElement
): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext("2d")
  } catch {
    return null
  }
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener("load", () => resolve(image), { once: true })
    image.addEventListener(
      "error",
      () => reject(new Error("이미지를 압축하지 못했습니다.")),
      { once: true }
    )
    image.src = dataUrl
  })
}

function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new Error("이미지를 압축하지 못했습니다."))
          return
        }

        readBlobAsDataUrl(blob)
          .then(resolve)
          .catch((error: unknown) => {
            reject(
              error instanceof Error
                ? error
                : new Error("이미지를 압축하지 못했습니다.")
            )
          })
      },
      requestImageMimeType,
      quality
    )
  })
}

async function compressImageForRequest(
  sourceDataUrl: string
): Promise<
  Pick<MarketingImageAsset, "requestDataUrl" | "requestMimeType"> | undefined
> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return undefined
  }

  const canvas = document.createElement("canvas")
  const context = readCanvasContext(canvas)
  if (context === null) {
    return undefined
  }

  let image: HTMLImageElement
  try {
    image = await loadImageFromDataUrl(sourceDataUrl)
  } catch {
    return undefined
  }

  const sourceWidth = image.naturalWidth
  const sourceHeight = image.naturalHeight
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return undefined
  }

  const sourceMaxDimension = Math.max(sourceWidth, sourceHeight)
  const firstDimension = Math.min(requestImageMaxDimension, sourceMaxDimension)
  const dimensions = requestImageDimensions.filter(
    (dimension) => dimension <= firstDimension
  )

  for (const dimension of dimensions) {
    const ratio = dimension / sourceMaxDimension
    canvas.width = Math.max(1, Math.round(sourceWidth * ratio))
    canvas.height = Math.max(1, Math.round(sourceHeight * ratio))
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    for (const quality of requestImageQualities) {
      const dataUrl = await canvasToDataUrl(canvas, quality)
      if (dataUrl.length <= postImageRequestDataUrlMaxChars) {
        return {
          requestDataUrl: dataUrl,
          requestMimeType: requestImageMimeType,
        }
      }
    }
  }

  return undefined
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

    const selectedFiles = Array.from(files).slice(0, postImageMaxCount)
    const unsupportedFile = selectedFiles.find(
      (file) => !isSupportedImageType(file.type)
    )
    if (unsupportedFile !== undefined) {
      onInvalidImage("JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.")
      return
    }

    const oversizedFile = selectedFiles.find(
      (file) => file.size > postImageMaxBytes
    )
    if (oversizedFile !== undefined) {
      onInvalidImage("이미지는 장당 20MB 이하로 올려주세요.")
      return
    }

    const nextAssets = await Promise.all(
      selectedFiles.map(async (file, index) => {
        const dataUrl = await readBlobAsDataUrl(file)
        return {
          ...(await compressImageForRequest(dataUrl)),
          dataUrl,
          id: `asset-${file.name}-${file.lastModified}-${index}`,
          mimeType: readSupportedImageMimeType(file),
          name: file.name,
          sizeBytes: file.size,
        }
      })
    )
    setImageAssets(nextAssets)
    onImagesSelected()
  }

  return {
    handleImageFiles,
    imageAssets,
  }
}
