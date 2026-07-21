import { describe, expect, it } from "vitest"

import {
  MediaStoreAssetNotFoundError,
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

    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") throw new Error("expected ok result")
    expect(result.value.uploadToken).toMatch(/^stub_upload_token_/)
    expect(result.value.blobUrl).toContain(
      "https://stub.blob.glocalx.internal/stores/store_123/"
    )
    expect(new Date(result.value.expiresAt).getTime()).toBeGreaterThan(
      Date.now()
    )
  })

  it("creates upload token for heic image input", async () => {
    const result = await store.createUploadToken({
      storeId: "store_123",
      filename: "sample.heic",
      contentType: "image/heic",
      sizeBytes: 1024 * 1024,
    })

    expect(result.kind).toBe("ok")
  })

  it("generates signed url for blob", async () => {
    const result = await store.getSignedUrl(
      "https://stub.blob.glocalx.internal/stores/store_123/asset.png"
    )
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") throw new Error("expected ok result")
    expect(result.value).toContain("signature=stub_sig_")
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

  it("deletes an asset without error", async () => {
    const created = await store.createUploadToken({
      storeId: "store_123",
      filename: "to-delete.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1000,
    })
    expect(created.kind).toBe("ok")
    if (created.kind !== "ok") throw new Error("expected ok result")

    const result = await store.deleteAsset(created.value.blobUrl)
    expect(result.kind).toBe("ok")
  })

  it("returns the real recorded metadata for a registered asset", async () => {
    const created = await store.createUploadToken({
      storeId: "store_123",
      filename: "metadata.jpg",
      contentType: "image/jpeg",
      sizeBytes: 2048,
    })
    expect(created.kind).toBe("ok")
    if (created.kind !== "ok") throw new Error("expected ok result")

    const result = await store.getAssetMetadata(created.value.blobUrl)
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") throw new Error("expected ok result")
    expect(result.value).toEqual({
      contentType: "image/jpeg",
      sizeBytes: 2048,
    })
  })

  it("throws MediaStoreAssetNotFoundError for an unknown blob url", async () => {
    await expect(
      store.getAssetMetadata(
        "https://stub.blob.glocalx.internal/stores/store_123/never-uploaded.jpg"
      )
    ).rejects.toThrow(MediaStoreAssetNotFoundError)
  })

  it("recovers metadata across a fresh instance (survives a create-token/register round trip on separate requests)", async () => {
    const created = await new StubMediaStore().createUploadToken({
      storeId: "store_123",
      filename: "cross-instance.jpg",
      contentType: "image/png",
      sizeBytes: 4096,
    })
    expect(created.kind).toBe("ok")
    if (created.kind !== "ok") throw new Error("expected ok result")

    // A real owner-app request creates a brand new adapters/StubMediaStore
    // instance per HTTP call, so the register-asset route's lookup must not
    // depend on the create-upload-token route's in-memory state.
    const result = await new StubMediaStore().getAssetMetadata(
      created.value.blobUrl
    )
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") throw new Error("expected ok result")
    expect(result.value).toEqual({ contentType: "image/png", sizeBytes: 4096 })
  })
})
