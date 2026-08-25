import { describe, expect, it } from "vitest"

import { findOrphanedUploads } from "./orphaned-uploads"

const now = new Date("2026-08-26T12:00:00.000Z")
const oneHourMs = 60 * 60 * 1000
const dayMs = 24 * oneHourMs

function asset(overrides: {
  readonly pathname: string
  readonly blobUrl: string
  readonly uploadedAt: string
  readonly sizeBytes?: number
}) {
  return {
    pathname: overrides.pathname,
    blobUrl: overrides.blobUrl,
    sizeBytes: overrides.sizeBytes ?? 1000,
    uploadedAt: overrides.uploadedAt,
  }
}

describe("findOrphanedUploads", () => {
  it("excludes blobs that are registered, regardless of age", () => {
    const registeredUrl = "https://blob.example/stores/s1/registered.png"
    const result = findOrphanedUploads({
      blobAssets: [
        asset({
          pathname: "stores/s1/registered.png",
          blobUrl: registeredUrl,
          uploadedAt: new Date(now.getTime() - 10 * dayMs).toISOString(),
        }),
      ],
      registeredBlobUrls: [registeredUrl],
      now,
      minAgeMs: dayMs,
    })

    expect(result).toEqual([])
  })

  it("excludes unregistered blobs younger than minAgeMs", () => {
    const result = findOrphanedUploads({
      blobAssets: [
        asset({
          pathname: "stores/s1/fresh.png",
          blobUrl: "https://blob.example/stores/s1/fresh.png",
          uploadedAt: new Date(now.getTime() - oneHourMs).toISOString(),
        }),
      ],
      registeredBlobUrls: [],
      now,
      minAgeMs: dayMs,
    })

    expect(result).toEqual([])
  })

  it("includes unregistered blobs at or past minAgeMs", () => {
    const orphanUrl = "https://blob.example/stores/s1/orphan.png"
    const result = findOrphanedUploads({
      blobAssets: [
        asset({
          pathname: "stores/s1/orphan.png",
          blobUrl: orphanUrl,
          uploadedAt: new Date(now.getTime() - dayMs).toISOString(),
          sizeBytes: 5000,
        }),
      ],
      registeredBlobUrls: [],
      now,
      minAgeMs: dayMs,
    })

    expect(result).toEqual([
      {
        pathname: "stores/s1/orphan.png",
        blobUrl: orphanUrl,
        sizeBytes: 5000,
        uploadedAt: new Date(now.getTime() - dayMs).toISOString(),
      },
    ])
  })

  it("mixes registered and unregistered blobs correctly", () => {
    const registeredUrl = "https://blob.example/stores/s1/keep.png"
    const orphanUrl = "https://blob.example/stores/s1/drop.png"
    const result = findOrphanedUploads({
      blobAssets: [
        asset({
          pathname: "stores/s1/keep.png",
          blobUrl: registeredUrl,
          uploadedAt: new Date(now.getTime() - 2 * dayMs).toISOString(),
        }),
        asset({
          pathname: "stores/s1/drop.png",
          blobUrl: orphanUrl,
          uploadedAt: new Date(now.getTime() - 2 * dayMs).toISOString(),
        }),
      ],
      registeredBlobUrls: [registeredUrl],
      now,
      minAgeMs: dayMs,
    })

    expect(result.map((candidate) => candidate.blobUrl)).toEqual([orphanUrl])
  })
})
