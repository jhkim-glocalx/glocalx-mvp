import { randomUUID } from "node:crypto"

import {
  BlobNotFoundError,
  del,
  head,
  issueSignedToken,
  presignUrl,
} from "@vercel/blob"
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client"

import type { AdapterEnvironment, AdapterResult } from "./contracts"
import { blockedByCredentials, missingEnvVars } from "./credentials"
import type {
  CreateUploadTokenInput,
  CreateUploadTokenResult,
  MediaStore,
  MediaStoreAssetMetadata,
} from "./media-store"
import {
  MediaStoreAssetNotFoundError,
  validateMediaUploadInput,
} from "./media-store"

export const blobEnvVars = [
  "BLOB_READ_WRITE_TOKEN",
  "BLOB_PUBLIC_HOST",
] as const

const uploadTokenValidSeconds = 15 * 60

function pathnameFromBlobUrl(blobUrl: string): string {
  return new URL(blobUrl).pathname.replace(/^\//, "")
}

// Vercel Blob never hands back a blob's final URL until the upload completes
// (there's no supported way to predict the CDN host from the read-write
// token), so the host is a founder-provisioned env var read once from the
// store's dashboard. registerCampaignAsset's head() re-validation catches a
// misconfigured host: an asset that doesn't actually resolve there is
// rejected loudly instead of silently trusted.
function blobUrlForPathname(env: AdapterEnvironment, pathname: string): string {
  return `https://${env["BLOB_PUBLIC_HOST"]}/${pathname}`
}

export function createProductionMediaStore(
  env: AdapterEnvironment
): MediaStore {
  return {
    async createUploadToken(
      input: CreateUploadTokenInput
    ): Promise<AdapterResult<CreateUploadTokenResult>> {
      const missing = missingEnvVars(env, blobEnvVars)
      if (missing.length > 0) {
        return blockedByCredentials(missing)
      }

      validateMediaUploadInput(input)

      const assetId = randomUUID()
      const pathname = `stores/${input.storeId}/${assetId}-${input.filename}`
      const blobUrl = blobUrlForPathname(env, pathname)
      const validUntil = Date.now() + uploadTokenValidSeconds * 1000

      const uploadToken = await generateClientTokenFromReadWriteToken({
        token: env["BLOB_READ_WRITE_TOKEN"] ?? "",
        pathname,
        allowedContentTypes: [input.contentType],
        maximumSizeInBytes: input.sizeBytes,
        addRandomSuffix: false,
        validUntil,
      })

      return {
        kind: "ok",
        value: {
          uploadToken,
          pathname,
          blobUrl,
          expiresAt: new Date(validUntil).toISOString(),
        },
      }
    },

    async getSignedUrl(
      blobUrl: string,
      expiresInSeconds = 3600
    ): Promise<AdapterResult<string>> {
      const missing = missingEnvVars(env, blobEnvVars)
      if (missing.length > 0) {
        return blockedByCredentials(missing)
      }

      const pathname = pathnameFromBlobUrl(blobUrl)
      const signedToken = await issueSignedToken({
        token: env["BLOB_READ_WRITE_TOKEN"] ?? "",
        pathname,
        operations: ["get"],
        validUntil: Date.now() + expiresInSeconds * 1000,
      })
      const { presignedUrl } = await presignUrl(signedToken, {
        operation: "get",
        pathname,
        access: "private",
      })

      return { kind: "ok", value: presignedUrl }
    },

    async getAssetMetadata(
      blobUrl: string
    ): Promise<AdapterResult<MediaStoreAssetMetadata>> {
      const missing = missingEnvVars(env, blobEnvVars)
      if (missing.length > 0) {
        return blockedByCredentials(missing)
      }

      try {
        const result = await head(blobUrl, {
          token: env["BLOB_READ_WRITE_TOKEN"] ?? "",
        })
        return {
          kind: "ok",
          value: { contentType: result.contentType, sizeBytes: result.size },
        }
      } catch (error) {
        if (error instanceof BlobNotFoundError) {
          throw new MediaStoreAssetNotFoundError(blobUrl)
        }
        throw error
      }
    },

    async deleteAsset(blobUrl: string): Promise<AdapterResult<void>> {
      const missing = missingEnvVars(env, blobEnvVars)
      if (missing.length > 0) {
        return blockedByCredentials(missing)
      }

      await del(blobUrl, { token: env["BLOB_READ_WRITE_TOKEN"] ?? "" })
      return { kind: "ok", value: undefined }
    },
  }
}
