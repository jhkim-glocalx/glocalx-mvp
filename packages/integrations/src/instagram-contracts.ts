import type { AdapterResult } from "./contracts"
import type { PublishedSocialPost } from "./social-publishing-contracts"

// A store's own linked business account. Supplied as one object because the
// token and the account it belongs to are never independently useful — passing
// one without the other would publish to the wrong account or not at all.
// Omitted means "use the environment's single global account", which is what
// v1's owner composer still does.
export type InstagramPublishAccount = {
  readonly accessToken: string
  readonly accountRef: string
}

export type CreateInstagramPostInput = {
  readonly caption: string
  readonly mediaUrls: readonly string[]
  readonly account?: InstagramPublishAccount | undefined
}

export interface InstagramPostsAdapter {
  createPost(
    input: CreateInstagramPostInput
  ): Promise<AdapterResult<PublishedSocialPost>>
}
