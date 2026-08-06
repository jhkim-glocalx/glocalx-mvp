import type { AdapterResult } from "./contracts"

// The Instagram Business Login connect flow: an owner authorizes our app to
// publish to *their own* Instagram business account (Instagram has no org-token
// equivalent to GBP — every account grants access individually). This module
// turns the authorization `code` the callback receives into a long-lived,
// per-store token, and refreshes that token before its ~60-day expiry.

export type InstagramConnectInput = {
  readonly code: string
  // Must byte-for-byte match the redirect_uri used to mint the code, per Meta's
  // OAuth contract, so the route passes back the exact value it built.
  readonly redirectUri: string
}

// Everything a store_channel_links row needs after a successful connect. The
// accessToken is the long-lived token (the caller encrypts it before storing);
// accountRef is the Instagram user id the publish adapter posts through.
export type InstagramLinkedAccount = {
  readonly accessToken: string
  readonly accountRef: string
  readonly username: string
  readonly accountType: string
  readonly expiresInSeconds: number
}

export type InstagramOAuthUpstreamReason =
  | "CODE_EXCHANGE_FAILED"
  | "LONG_LIVED_EXCHANGE_FAILED"
  | "IDENTITY_FAILED"
  | "REFRESH_FAILED"
  | "NETWORK_ERROR"
  | "MALFORMED_RESPONSE"

export type InstagramConnectOutcome =
  | { readonly kind: "linked"; readonly account: InstagramLinkedAccount }
  // The account authenticated but is a personal (non-professional) account, so
  // the Content Publishing API will not work. The caller shows the owner the
  // "switch to a professional account" guidance rather than a raw error.
  | {
      readonly kind: "needs_professional_account"
      readonly username: string | undefined
      readonly accountType: string
    }
  | {
      readonly kind: "upstream_error"
      readonly reason: InstagramOAuthUpstreamReason
    }

export type InstagramRefreshInput = {
  readonly accessToken: string
}

export type InstagramRefreshOutcome =
  | {
      readonly kind: "refreshed"
      readonly accessToken: string
      readonly expiresInSeconds: number
    }
  | {
      readonly kind: "upstream_error"
      readonly reason: InstagramOAuthUpstreamReason
    }

export interface InstagramOAuthAdapter {
  connect(
    input: InstagramConnectInput
  ): Promise<AdapterResult<InstagramConnectOutcome>>
  refresh(
    input: InstagramRefreshInput
  ): Promise<AdapterResult<InstagramRefreshOutcome>>
}
