import { z } from "zod"

// Organization-wide publishing credentials (architecture.md "Organization
// publishing credentials"). v1 published with the owner's own Google token; v2
// publishes to many stores' locations from one org account, so the credential
// is org-scoped and lives only in the admin app.
//
// Only `google_org` is consumed by the publish path today. Instagram publishes
// with the *per-store* token on store_channel_links — a linked business account
// is its own credential — so `meta_app` is storable ahead of Meta app review
// completing, but nothing reads it yet.

export const orgCredentialProviderSchema = z.enum(["google_org", "meta_app"])
export type OrgCredentialProvider = z.infer<typeof orgCredentialProviderSchema>

export const orgCredentialProviders = orgCredentialProviderSchema.options

export type OrgCredentialBlockedCode =
  | "ORG_CREDENTIAL_MISSING"
  | "ORG_CREDENTIAL_EXPIRED"
  | "ORG_CREDENTIAL_UNREADABLE"

// The three ways a lookup can land, kept apart on purpose: "we never had one",
// "we have one we can't read", and "we have a readable one". Collapsing the
// middle case into missing would send an operator to re-paste a token when the
// real fault is a rotated TOKEN_ENCRYPTION_KEY.
export type OrgCredentialLookupFacts =
  | {
      readonly kind: "found"
      readonly accessToken: string
      readonly expiresAt: Date | null
    }
  | { readonly kind: "missing" }
  | { readonly kind: "undecryptable" }

// The usable verdict carries the token back out. That is deliberate: it makes
// this function the only way to obtain a credential, so no caller can reach a
// token without having passed the expiry gate first.
export type OrgCredentialState =
  | { readonly kind: "usable"; readonly accessToken: string }
  | {
      readonly kind: "blocked"
      readonly code: OrgCredentialBlockedCode
      readonly message: string
    }

// A token that expires mid-flight fails inside the channel call, where the only
// evidence is a provider error we deliberately don't log. Treating the last
// minute of a token's life as already expired keeps that failure on this side of
// the boundary, where it reads as "re-link the org account".
export const orgCredentialExpiryGraceSeconds = 60

const providerLabels: Readonly<Record<OrgCredentialProvider, string>> = {
  google_org: "Google organization",
  meta_app: "Meta app",
}

export function orgCredentialProviderLabel(
  provider: OrgCredentialProvider
): string {
  return providerLabels[provider]
}

// Shared by the publish gate and the settings panel's status badge, so the
// operator never sees "linked" for a credential publishing would refuse. A
// credential that reports no expiry never expires — distinct from one whose
// expiry has already passed.
export function isOrgCredentialExpired(
  expiresAt: Date | null,
  now: Date
): boolean {
  if (expiresAt === null) {
    return false
  }
  const usableUntil =
    expiresAt.getTime() - orgCredentialExpiryGraceSeconds * 1000
  return usableUntil <= now.getTime()
}

// Detect-and-fail, never a silent refresh loop (architecture.md). The stored
// refresh token exists so an operator can rotate the credential deliberately,
// not so the publish path can retry its way past an expiry.
export function evaluateOrgCredentialState(
  lookup: OrgCredentialLookupFacts,
  now: Date
): OrgCredentialState {
  if (lookup.kind === "missing") {
    return {
      kind: "blocked",
      code: "ORG_CREDENTIAL_MISSING",
      message:
        "No organization publishing credential is configured for this channel. Add one in Settings.",
    }
  }

  if (lookup.kind === "undecryptable") {
    return {
      kind: "blocked",
      code: "ORG_CREDENTIAL_UNREADABLE",
      message:
        "The stored organization credential could not be read. The encryption key may have rotated — re-save the credential in Settings.",
    }
  }

  if (isOrgCredentialExpired(lookup.expiresAt, now)) {
    return {
      kind: "blocked",
      code: "ORG_CREDENTIAL_EXPIRED",
      message:
        "The organization publishing credential has expired. Re-link it in Settings before publishing.",
    }
  }

  return { kind: "usable", accessToken: lookup.accessToken }
}

// The operator pastes the token itself, so the schema is strict about shape and
// silent about content — no value from this payload is ever echoed back.
export const saveOrgCredentialRequestSchema = z
  .object({
    provider: orgCredentialProviderSchema,
    token: z.string().trim().min(1).max(4096),
    refreshToken: z.string().trim().min(1).max(4096).optional(),
    // ISO-8601; omitted means the credential reports no expiry.
    expiresAt: z.iso.datetime({ offset: true }).optional(),
    scopes: z.string().trim().max(2048).optional(),
  })
  .strict()

export type SaveOrgCredentialRequest = z.infer<
  typeof saveOrgCredentialRequestSchema
>
