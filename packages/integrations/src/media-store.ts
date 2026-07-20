export const mediaStoreMaxFileSizeBytes = 10 * 1024 * 1024 // 10MB
export const mediaStoreMaxFilesPerRequest = 10
export const mediaStoreAllowedContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const

export type MediaStoreAllowedContentType = (typeof mediaStoreAllowedContentTypes)[number]

export type CreateUploadTokenInput = {
  readonly storeId: string
  readonly filename: string
  readonly contentType: string
  readonly sizeBytes: number
}

export type CreateUploadTokenResult = {
  readonly uploadToken: string
  readonly blobUrl: string
  readonly expiresAt: string
}

export class MediaStoreValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MediaStoreValidationError"
  }
}

export interface MediaStore {
  createUploadToken(input: CreateUploadTokenInput): Promise<CreateUploadTokenResult>
  getSignedUrl(blobUrl: string, expiresInSeconds?: number): Promise<string>
  deleteAsset(blobUrl: string): Promise<void>
}

export function validateMediaUploadInput(input: CreateUploadTokenInput): void {
  if (!input.storeId || input.storeId.trim().length === 0) {
    throw new MediaStoreValidationError("storeId is required")
  }
  if (!input.filename || input.filename.trim().length === 0) {
    throw new MediaStoreValidationError("filename is required")
  }
  if (!mediaStoreAllowedContentTypes.includes(input.contentType as MediaStoreAllowedContentType)) {
    throw new MediaStoreValidationError(
      `Invalid content type "${input.contentType}". Allowed types: ${mediaStoreAllowedContentTypes.join(", ")}`
    )
  }
  if (typeof input.sizeBytes !== "number" || input.sizeBytes <= 0) {
    throw new MediaStoreValidationError("sizeBytes must be a positive integer")
  }
  if (input.sizeBytes > mediaStoreMaxFileSizeBytes) {
    throw new MediaStoreValidationError(
      `File size ${input.sizeBytes} bytes exceeds maximum allowed limit of ${mediaStoreMaxFileSizeBytes} bytes (10MB)`
    )
  }
}

export class StubMediaStore implements MediaStore {
  private readonly assets = new Map<string, { storeId: string; contentType: string; sizeBytes: number }>()

  async createUploadToken(input: CreateUploadTokenInput): Promise<CreateUploadTokenResult> {
    validateMediaUploadInput(input)

    const assetId = `stub_blob_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const blobUrl = `https://stub.blob.glocalx.internal/stores/${input.storeId}/${assetId}-${input.filename}`
    const uploadToken = `stub_upload_token_${assetId}`
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    this.assets.set(blobUrl, {
      storeId: input.storeId,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    })

    return {
      uploadToken,
      blobUrl,
      expiresAt,
    }
  }

  async getSignedUrl(blobUrl: string, expiresInSeconds = 3600): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds
    return `${blobUrl}?signature=stub_sig_${expiresAt}&expires=${expiresAt}`
  }

  async deleteAsset(blobUrl: string): Promise<void> {
    this.assets.delete(blobUrl)
  }
}
