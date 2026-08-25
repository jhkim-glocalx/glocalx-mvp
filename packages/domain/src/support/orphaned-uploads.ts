// The orphaned-upload sweep (TODOS.md #4): client-direct Blob uploads
// register a campaign_assets row only after the browser-to-Blob PUT
// completes, so a tab closed mid-upload-loop leaves an object in the Blob
// store nothing in the database ever references. This is the pure diff —
// callers supply what Blob actually has and what the database actually
// knows, and get back objects safe to reclaim.

export type OrphanedUploadCandidate = {
  readonly pathname: string
  readonly blobUrl: string
  readonly sizeBytes: number
  readonly uploadedAt: string
}

export function findOrphanedUploads(input: {
  readonly blobAssets: readonly {
    readonly pathname: string
    readonly blobUrl: string
    readonly sizeBytes: number
    readonly uploadedAt: string
  }[]
  readonly registeredBlobUrls: readonly string[]
  readonly now: Date
  readonly minAgeMs: number
}): readonly OrphanedUploadCandidate[] {
  const registered = new Set(input.registeredBlobUrls)
  const cutoff = input.now.getTime() - input.minAgeMs

  return input.blobAssets.filter((asset) => {
    if (registered.has(asset.blobUrl)) {
      return false
    }
    return new Date(asset.uploadedAt).getTime() <= cutoff
  })
}
