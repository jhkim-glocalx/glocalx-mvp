import { randomUUID } from "node:crypto"

import type { CampaignRequestDetail } from "@glocalx/db/support/campaign-store"
import type { OrgCredentialStore } from "@glocalx/db/support/org-credential-store"
import type { PublishJobStore } from "@glocalx/db/support/publish-job-store"
import type { PublishTargetStore } from "@glocalx/db/support/publish-target-store"
import type { CampaignAsset } from "@glocalx/domain/campaign-contracts"
import {
  publishChannelSchema,
  type PublishChannel,
} from "@glocalx/domain/campaign-state-machine"
import { evaluateOrgCredentialState } from "@glocalx/domain/org-credentials"
import { evaluatePublishEligibility } from "@glocalx/domain/publish-eligibility"
import type { PublishEligibility } from "@glocalx/domain/publish-eligibility"
import type { createIntegrationAdapters } from "@glocalx/integrations"

type IntegrationAdapters = ReturnType<typeof createIntegrationAdapters>

// Meta's Graph flow fetches the image from a URL we hand it, so the assets stay
// private at rest and each attempt mints its own short-lived readable window
// (architecture.md "Instagram publish URLs").
export const publishSignedUrlTtlSeconds = 3600

export const publishChannels = publishChannelSchema.options

export type PublishEligibilityByChannel = Readonly<
  Record<PublishChannel, PublishEligibility>
>

// One read of the store's publishing facts, one verdict per channel. The panel
// renders these and the publish route re-checks them, so a channel that shows
// as blocked cannot be published by a stale or hand-rolled POST.
export async function resolvePublishEligibility(
  publishTargetStore: PublishTargetStore,
  storeId: string
): Promise<PublishEligibilityByChannel> {
  const [gbpLocationStatus, instagramLink] = await Promise.all([
    publishTargetStore.readGbpLocationStatus(storeId),
    publishTargetStore.readStoreChannelLink(storeId, "instagram"),
  ])
  const facts = {
    gbpLocationStatus,
    instagramLinkStatus: instagramLink?.status,
  }

  return {
    gbp: evaluatePublishEligibility("gbp", facts),
    instagram: evaluatePublishEligibility("instagram", facts),
  }
}

export type ChannelPublishOutcome = {
  readonly channel: PublishChannel
  readonly kind:
    | "published"
    | "already_published"
    | "failed"
    | "retry_limit"
    | "in_progress"
  readonly message: string | null
}

export type RunCampaignPublishInput = {
  readonly adapters: IntegrationAdapters
  readonly orgCredentialStore: OrgCredentialStore
  readonly publishJobStore: PublishJobStore
  readonly publishTargetStore: PublishTargetStore
  readonly request: CampaignRequestDetail
  readonly channels: readonly PublishChannel[]
  readonly now: Date
}

type PublishAttemptFailure = { readonly failureMessage: string }

function isFailure(
  value: { readonly externalPostId: string } | PublishAttemptFailure
): value is PublishAttemptFailure {
  return "failureMessage" in value
}

function processedAssets(
  request: CampaignRequestDetail
): readonly CampaignAsset[] {
  return request.assets.filter((asset) => asset.kind === "processed")
}

type MintedMediaUrls =
  | { readonly kind: "ok"; readonly urls: readonly string[] }
  | ({ readonly kind: "failed" } & PublishAttemptFailure)

// Every channel needs the finished material as URLs it can fetch. Minted per
// attempt rather than per run so a retry never hands a channel a signed URL
// that expired while the previous attempt was failing.
async function mintMediaUrls(
  adapters: IntegrationAdapters,
  request: CampaignRequestDetail
): Promise<MintedMediaUrls> {
  const urls: string[] = []
  for (const asset of processedAssets(request)) {
    const signed = await adapters.mediaStore.getSignedUrl(
      asset.blobUrl,
      publishSignedUrlTtlSeconds
    )
    if (signed.kind !== "ok") {
      return {
        kind: "failed",
        failureMessage:
          "Could not mint a signed media URL for the processed assets.",
      }
    }
    urls.push(signed.value)
  }
  return { kind: "ok", urls }
}

async function publishToChannel(
  input: RunCampaignPublishInput,
  channel: PublishChannel
): Promise<{ readonly externalPostId: string } | PublishAttemptFailure> {
  const minted = await mintMediaUrls(input.adapters, input.request)
  if (minted.kind === "failed") {
    return { failureMessage: minted.failureMessage }
  }
  const mediaUrls = minted.urls

  const summary = input.request.finalCopy ?? ""

  if (channel === "gbp") {
    // v2 publishes from the ORG account, not the owner's Google token: one
    // credential fans out across every store's location. The owner-token path
    // (readGbpPublishingCredentials) stays behind v1's own composer.
    const credential = evaluateOrgCredentialState(
      await input.orgCredentialStore.readOrgCredential("google_org"),
      input.now
    )
    if (credential.kind === "blocked") {
      return { failureMessage: credential.message }
    }

    const parent = await input.publishTargetStore.readGbpPublishParent(
      input.request.storeId
    )
    if (parent === undefined) {
      return {
        failureMessage:
          "This store has no verified Google Business Profile location to publish to.",
      }
    }

    const result = await input.adapters.gbpLocalPosts.createLocalPost({
      accessToken: credential.accessToken,
      mediaUrls,
      parent,
      summary,
    })
    return result.kind === "blocked_by_credentials"
      ? {
          failureMessage:
            "Google Business Profile publishing is not configured for this environment.",
        }
      : { externalPostId: result.value.externalPostId }
  }

  // Instagram's credential is the store's own linked business account. A link
  // that carries no token yet falls through to the environment account, which
  // is what keeps stub mode and the v1 composer working unchanged.
  const channelToken = await input.publishTargetStore.readStoreChannelToken(
    input.request.storeId,
    "instagram"
  )
  if (channelToken.kind === "undecryptable") {
    return {
      failureMessage:
        "The store's stored Instagram token could not be read. The encryption key may have rotated — re-link the account.",
    }
  }

  const link =
    channelToken.kind === "found"
      ? await input.publishTargetStore.readStoreChannelLink(
          input.request.storeId,
          "instagram"
        )
      : undefined

  const result = await input.adapters.instagramPosts.createPost({
    caption: summary,
    mediaUrls,
    account:
      channelToken.kind === "found" && link !== undefined
        ? {
            accessToken: channelToken.accessToken,
            accountRef: link.externalAccountRef,
          }
        : undefined,
  })
  return result.kind === "blocked_by_credentials"
    ? {
        failureMessage:
          "Instagram publishing is not configured for this environment.",
      }
    : { externalPostId: result.value.externalPostId }
}

// Runs the selected channels in order and settles each job. Channels are
// independent: one failing never stops the next, which is what makes
// "partially_published" a real outcome rather than an abort.
export async function runCampaignPublish(
  input: RunCampaignPublishInput
): Promise<readonly ChannelPublishOutcome[]> {
  const outcomes: ChannelPublishOutcome[] = []

  for (const channel of input.channels) {
    const reservation = await input.publishJobStore.reservePublishJob({
      id: randomUUID(),
      requestId: input.request.id,
      channel,
      now: input.now,
    })

    if (reservation.kind === "replay") {
      outcomes.push({
        channel,
        kind: "already_published",
        message: "Already published to this channel.",
      })
      continue
    }
    if (reservation.kind === "in_progress") {
      outcomes.push({
        channel,
        kind: "in_progress",
        message: "Another publish run holds this channel.",
      })
      continue
    }
    if (reservation.kind === "retry_limit") {
      outcomes.push({
        channel,
        kind: "retry_limit",
        message:
          "This channel has used all three attempts. Publish it by hand and record the result.",
      })
      continue
    }

    let attempt: { readonly externalPostId: string } | PublishAttemptFailure
    try {
      attempt = await publishToChannel(input, channel)
    } catch (error) {
      // Log the channel library's own error only — never the credentials or the
      // signed URLs that were passed to it (the token-encryption precedent).
      console.error(
        `Campaign publish threw for request "${input.request.id}" channel "${channel}"`,
        error instanceof Error ? error.message : error
      )
      attempt = {
        failureMessage: "The channel rejected the publish request.",
      }
    }

    if (isFailure(attempt)) {
      await input.publishJobStore.failPublishJob({
        requestId: input.request.id,
        channel,
        error: attempt.failureMessage,
        now: input.now,
      })
      outcomes.push({
        channel,
        kind: "failed",
        message: attempt.failureMessage,
      })
      continue
    }

    await input.publishJobStore.completePublishJob({
      requestId: input.request.id,
      channel,
      externalRef: attempt.externalPostId,
      now: input.now,
    })
    outcomes.push({ channel, kind: "published", message: null })
  }

  return outcomes
}
