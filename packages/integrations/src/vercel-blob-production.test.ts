import { beforeEach, describe, expect, it, vi } from "vitest"

import { BlobNotFoundError } from "@vercel/blob"
import type * as VercelBlob from "@vercel/blob"

import { MediaStoreAssetNotFoundError } from "./media-store"
import { createProductionMediaStore } from "./vercel-blob-production"

const { headMock, delMock, issueSignedTokenMock, presignUrlMock, listMock } =
  vi.hoisted(() => ({
    headMock: vi.fn(),
    delMock: vi.fn(),
    issueSignedTokenMock: vi.fn(),
    presignUrlMock: vi.fn(),
    listMock: vi.fn(),
  }))

vi.mock("@vercel/blob", async (importOriginal) => {
  const actual = await importOriginal<typeof VercelBlob>()
  return {
    ...actual,
    head: headMock,
    del: delMock,
    issueSignedToken: issueSignedTokenMock,
    presignUrl: presignUrlMock,
    list: listMock,
  }
})

const { generateClientTokenMock } = vi.hoisted(() => ({
  generateClientTokenMock: vi.fn(),
}))

vi.mock("@vercel/blob/client", () => ({
  generateClientTokenFromReadWriteToken: generateClientTokenMock,
}))

const configuredEnv = {
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test_token",
  BLOB_PUBLIC_HOST: "test123.private.blob.vercel-storage.com",
}

describe("createProductionMediaStore", () => {
  beforeEach(() => {
    headMock.mockReset()
    delMock.mockReset()
    listMock.mockReset()
    issueSignedTokenMock.mockReset()
    presignUrlMock.mockReset()
    generateClientTokenMock.mockReset()
  })

  it("returns blocked_by_credentials when env vars are missing", async () => {
    const store = createProductionMediaStore({})
    const result = await store.createUploadToken({
      storeId: "store_123",
      filename: "sample.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1000,
    })

    expect(result.kind).toBe("blocked_by_credentials")
    if (result.kind !== "blocked_by_credentials")
      throw new Error("expected blocked result")
    expect(result.missingEnvVars).toEqual(
      expect.arrayContaining(["BLOB_READ_WRITE_TOKEN", "BLOB_PUBLIC_HOST"])
    )
  })

  it("generates a client upload token and a predictable blob url", async () => {
    generateClientTokenMock.mockResolvedValue("client_token_abc")
    const store = createProductionMediaStore(configuredEnv)

    const result = await store.createUploadToken({
      storeId: "store_123",
      filename: "sample.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1000,
    })

    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") throw new Error("expected ok result")
    expect(result.value.uploadToken).toBe("client_token_abc")
    expect(result.value.pathname).toMatch(/^stores\/store_123\//)
    expect(result.value.blobUrl).toBe(
      `https://${configuredEnv.BLOB_PUBLIC_HOST}/${result.value.pathname}`
    )
    expect(generateClientTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: result.value.pathname,
        allowedContentTypes: ["image/jpeg"],
        maximumSizeInBytes: 1000,
        addRandomSuffix: false,
      })
    )
  })

  it("rejects invalid upload input before calling the SDK", async () => {
    const store = createProductionMediaStore(configuredEnv)

    await expect(
      store.createUploadToken({
        storeId: "store_123",
        filename: "sample.pdf",
        contentType: "application/pdf",
        sizeBytes: 1000,
      })
    ).rejects.toThrow()
    expect(generateClientTokenMock).not.toHaveBeenCalled()
  })

  it("returns real metadata from head() for getAssetMetadata", async () => {
    headMock.mockResolvedValue({
      contentType: "image/png",
      size: 4096,
    })
    const store = createProductionMediaStore(configuredEnv)

    const result = await store.getAssetMetadata(
      `https://${configuredEnv.BLOB_PUBLIC_HOST}/stores/store_123/asset.png`
    )

    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") throw new Error("expected ok result")
    expect(result.value).toEqual({ contentType: "image/png", sizeBytes: 4096 })
  })

  it("throws MediaStoreAssetNotFoundError when the blob doesn't exist", async () => {
    headMock.mockRejectedValue(new BlobNotFoundError())
    const store = createProductionMediaStore(configuredEnv)

    await expect(
      store.getAssetMetadata(
        `https://${configuredEnv.BLOB_PUBLIC_HOST}/stores/store_123/missing.png`
      )
    ).rejects.toThrow(MediaStoreAssetNotFoundError)
  })

  it("issues a presigned get url for getSignedUrl", async () => {
    issueSignedTokenMock.mockResolvedValue({
      delegationToken: "d",
      clientSigningToken: "c",
      validUntil: Date.now() + 3600_000,
    })
    presignUrlMock.mockResolvedValue({
      presignedUrl: "https://presigned.example/asset.png",
    })
    const store = createProductionMediaStore(configuredEnv)

    const result = await store.getSignedUrl(
      `https://${configuredEnv.BLOB_PUBLIC_HOST}/stores/store_123/asset.png`
    )

    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") throw new Error("expected ok result")
    expect(result.value).toBe("https://presigned.example/asset.png")
  })

  it("deletes an asset via del()", async () => {
    delMock.mockResolvedValue(undefined)
    const store = createProductionMediaStore(configuredEnv)

    const result = await store.deleteAsset(
      `https://${configuredEnv.BLOB_PUBLIC_HOST}/stores/store_123/asset.png`
    )

    expect(result.kind).toBe("ok")
    expect(delMock).toHaveBeenCalledWith(
      `https://${configuredEnv.BLOB_PUBLIC_HOST}/stores/store_123/asset.png`,
      { token: configuredEnv.BLOB_READ_WRITE_TOKEN }
    )
  })

  it("returns blocked_by_credentials for listAssets when env vars are missing", async () => {
    const store = createProductionMediaStore({})
    const result = await store.listAssets()
    expect(result.kind).toBe("blocked_by_credentials")
  })

  it("lists a single page of blobs", async () => {
    listMock.mockResolvedValue({
      blobs: [
        {
          url: "https://example.blob.vercel-storage.com/stores/s1/a.png",
          downloadUrl:
            "https://example.blob.vercel-storage.com/stores/s1/a.png",
          pathname: "stores/s1/a.png",
          size: 1234,
          uploadedAt: new Date("2026-08-01T00:00:00.000Z"),
          etag: "etag1",
        },
      ],
      hasMore: false,
    })
    const store = createProductionMediaStore(configuredEnv)

    const result = await store.listAssets()

    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") throw new Error("expected ok result")
    expect(result.value).toEqual([
      {
        pathname: "stores/s1/a.png",
        blobUrl: "https://example.blob.vercel-storage.com/stores/s1/a.png",
        sizeBytes: 1234,
        uploadedAt: "2026-08-01T00:00:00.000Z",
      },
    ])
    expect(listMock).toHaveBeenCalledWith({
      prefix: "stores/",
      token: configuredEnv.BLOB_READ_WRITE_TOKEN,
    })
  })

  it("follows the cursor across multiple pages", async () => {
    listMock
      .mockResolvedValueOnce({
        blobs: [
          {
            url: "https://example.blob.vercel-storage.com/stores/s1/a.png",
            downloadUrl:
              "https://example.blob.vercel-storage.com/stores/s1/a.png",
            pathname: "stores/s1/a.png",
            size: 100,
            uploadedAt: new Date("2026-08-01T00:00:00.000Z"),
            etag: "etag1",
          },
        ],
        hasMore: true,
        cursor: "next-cursor",
      })
      .mockResolvedValueOnce({
        blobs: [
          {
            url: "https://example.blob.vercel-storage.com/stores/s1/b.png",
            downloadUrl:
              "https://example.blob.vercel-storage.com/stores/s1/b.png",
            pathname: "stores/s1/b.png",
            size: 200,
            uploadedAt: new Date("2026-08-02T00:00:00.000Z"),
            etag: "etag2",
          },
        ],
        hasMore: false,
      })
    const store = createProductionMediaStore(configuredEnv)

    const result = await store.listAssets()

    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") throw new Error("expected ok result")
    expect(result.value).toHaveLength(2)
    expect(listMock).toHaveBeenNthCalledWith(2, {
      prefix: "stores/",
      token: configuredEnv.BLOB_READ_WRITE_TOKEN,
      cursor: "next-cursor",
    })
  })

  it("stops after the page cap even if hasMore keeps returning true", async () => {
    listMock.mockResolvedValue({
      blobs: [],
      hasMore: true,
      cursor: "looping-cursor",
    })
    const store = createProductionMediaStore(configuredEnv)

    const result = await store.listAssets()

    expect(result.kind).toBe("ok")
    expect(listMock).toHaveBeenCalledTimes(20)
  })
})
