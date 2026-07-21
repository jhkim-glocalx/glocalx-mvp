import type { AdapterResult } from "./contracts"

export const mediaStoreMaxFileSizeBytes = 10 * 1024 * 1024 // 10MB
export const mediaStoreMaxFilesPerRequest = 10
export const mediaStoreAllowedContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const

export type MediaStoreAllowedContentType =
  (typeof mediaStoreAllowedContentTypes)[number]

export type CreateUploadTokenInput = {
  readonly storeId: string
  readonly filename: string
  readonly contentType: string
  readonly sizeBytes: number
}

export type CreateUploadTokenResult = {
  readonly uploadToken: string
  // The pathname the client must upload to (via `@vercel/blob/client`'s `put`).
  // blobUrl is derived from it but isn't authoritative until the upload completes.
  readonly pathname: string
  readonly blobUrl: string
  readonly expiresAt: string
}

export class MediaStoreValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MediaStoreValidationError"
  }
}

// Thrown (not an AdapterResult) when a pathname/blobUrl doesn't resolve to a
// real stored object — mirrors @vercel/blob's own head()/BlobNotFoundError,
// per the house convention that AdapterResult is reserved for the
// credential-blocked state while upstream/transport failures propagate as
// exceptions (see naver-production.ts / openai-production.ts).
export class MediaStoreAssetNotFoundError extends Error {
  constructor(blobUrl: string) {
    super(`No asset found at ${blobUrl}`)
    this.name = "MediaStoreAssetNotFoundError"
  }
}

export type MediaStoreAssetMetadata = {
  readonly contentType: string
  readonly sizeBytes: number
}

export interface MediaStore {
  createUploadToken(
    input: CreateUploadTokenInput
  ): Promise<AdapterResult<CreateUploadTokenResult>>
  getSignedUrl(
    blobUrl: string,
    expiresInSeconds?: number
  ): Promise<AdapterResult<string>>
  // Re-derives the real stored content type/size from the store itself
  // (never the client's own claims) so asset registration can reject an
  // oversize or disallowed upload even if the client token flow was
  // bypassed. Throws MediaStoreAssetNotFoundError if blobUrl doesn't resolve.
  getAssetMetadata(
    blobUrl: string
  ): Promise<AdapterResult<MediaStoreAssetMetadata>>
  deleteAsset(blobUrl: string): Promise<AdapterResult<void>>
}

// storeId and filename are interpolated into the blob object key
// (`/stores/<storeId>/<assetId>-<filename>`), so a separator or traversal
// segment in either would write outside the owning store's prefix.
const unsafePathSegmentPattern = /[/\\]|\.\./

export function validateMediaUploadInput(input: CreateUploadTokenInput): void {
  if (!input.storeId || input.storeId.trim().length === 0) {
    throw new MediaStoreValidationError("storeId is required")
  }
  if (unsafePathSegmentPattern.test(input.storeId)) {
    throw new MediaStoreValidationError(
      "storeId must not contain path separators or traversal segments"
    )
  }
  if (!input.filename || input.filename.trim().length === 0) {
    throw new MediaStoreValidationError("filename is required")
  }
  if (unsafePathSegmentPattern.test(input.filename)) {
    throw new MediaStoreValidationError(
      "filename must not contain path separators or traversal segments"
    )
  }
  if (
    !mediaStoreAllowedContentTypes.includes(
      input.contentType as MediaStoreAllowedContentType
    )
  ) {
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

// Stateless by design: a route's create-upload-token call and its later
// register-asset call each get their OWN createIntegrationAdapters() /
// StubMediaStore instance (one per request), so adapter-instance memory
// never survives the round trip a real browser upload makes. Metadata rides
// in the fake URL's query string instead, mirroring how getSignedUrl already
// encodes signature/expires there.
export class StubMediaStore implements MediaStore {
  async createUploadToken(
    input: CreateUploadTokenInput
  ): Promise<AdapterResult<CreateUploadTokenResult>> {
    validateMediaUploadInput(input)

    const assetId = `stub_blob_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const pathname = `stores/${input.storeId}/${assetId}-${input.filename}`
    const metaQuery = `contentType=${encodeURIComponent(input.contentType)}&sizeBytes=${input.sizeBytes}`
    const blobUrl = `https://stub.blob.glocalx.internal/${pathname}?${metaQuery}`
    const uploadToken = `stub_upload_token_${assetId}`
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

    return {
      kind: "ok",
      value: { uploadToken, pathname, blobUrl, expiresAt },
    }
  }

  async getSignedUrl(
    blobUrl: string,
    expiresInSeconds = 3600
  ): Promise<AdapterResult<string>> {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds
    const separator = blobUrl.includes("?") ? "&" : "?"
    return {
      kind: "ok",
      value: `${blobUrl}${separator}signature=stub_sig_${expiresAt}&expires=${expiresAt}`,
    }
  }

  async getAssetMetadata(
    blobUrl: string
  ): Promise<AdapterResult<MediaStoreAssetMetadata>> {
    const params = new URL(blobUrl).searchParams
    const contentType = params.get("contentType")
    const sizeBytes = Number(params.get("sizeBytes"))
    if (contentType === null || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw new MediaStoreAssetNotFoundError(blobUrl)
    }
    return { kind: "ok", value: { contentType, sizeBytes } }
  }

  async deleteAsset(_blobUrl: string): Promise<AdapterResult<void>> {
    return { kind: "ok", value: undefined }
  }
}
