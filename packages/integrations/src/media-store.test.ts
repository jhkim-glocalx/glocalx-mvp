import { describe, expect, it } from "vitest"

import {
  MediaStoreValidationError,
  StubMediaStore,
  validateMediaUploadInput,
} from "./media-store"

describe("StubMediaStore", () => {
  const store = new StubMediaStore()

  it("creates upload token for valid image upload input", async () => {
    const result = await store.createUploadToken({
      storeId: "store_123",
      filename: "sample.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1024 * 1024,
    })

    expect(result.uploadToken).toMatch(/^stub_upload_token_/)
    expect(result.blobUrl).toContain(
      "https://stub.blob.glocalx.internal/stores/store_123/"
    )
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it("generates signed url for blob", async () => {
    const signedUrl = await store.getSignedUrl(
      "https://stub.blob.glocalx.internal/stores/store_123/asset.png"
    )
    expect(signedUrl).toContain("signature=stub_sig_")
  })

  it("validates content types and rejects disallowed types", () => {
    expect(() =>
      validateMediaUploadInput({
        storeId: "store_123",
        filename: "doc.pdf",
        contentType: "application/pdf",
        sizeBytes: 1000,
      })
    ).toThrow(MediaStoreValidationError)
  })

  it("rejects filenames that would escape the store's blob prefix", () => {
    for (const filename of ["../../other-store/x.jpg", "nested/x.jpg"]) {
      expect(() =>
        validateMediaUploadInput({
          storeId: "store_123",
          filename,
          contentType: "image/jpeg",
          sizeBytes: 1000,
        })
      ).toThrow(MediaStoreValidationError)
    }
  })

  it("rejects store ids that would escape the blob prefix", () => {
    expect(() =>
      validateMediaUploadInput({
        storeId: "store_123/../store_456",
        filename: "sample.jpg",
        contentType: "image/jpeg",
        sizeBytes: 1000,
      })
    ).toThrow(MediaStoreValidationError)
  })

  it("enforces 10MB file size limit", () => {
    expect(() =>
      validateMediaUploadInput({
        storeId: "store_123",
        filename: "huge.jpg",
        contentType: "image/jpeg",
        sizeBytes: 15 * 1024 * 1024,
      })
    ).toThrow(MediaStoreValidationError)
  })
})
