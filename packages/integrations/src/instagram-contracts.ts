import type { AdapterResult } from "./contracts"
import type { PublishedSocialPost } from "./social-publishing-contracts"

export type CreateInstagramPostInput = {
  readonly caption: string
  readonly mediaUrls: readonly string[]
}

export interface InstagramPostsAdapter {
  createPost(
    input: CreateInstagramPostInput
  ): Promise<AdapterResult<PublishedSocialPost>>
}
