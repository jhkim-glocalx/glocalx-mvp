# Google Business Profile API Integration

Last reviewed: 2026-07-15

This document defines the Google Business Profile (GBP) APIs that GlocalX uses
or is likely to use. It records the intended lifecycle, the current repository
status, and the safeguards required before any production mutation is enabled.

Google does not provide a GBP sandbox. A successful create, update, verification,
post, reply, media, or admin request changes a real Business Profile. Treat every
write as a production operation, even in a preview deployment.

## What completing onboarding should mean

Completing GlocalX onboarding must not automatically imply that a new GBP was
created. The outcome depends on Google's duplicate search and the connected
Google account's access:

1. The business already exists and the connected account can manage it: attach
   the existing location after the user confirms it.
2. The business exists but another account manages it: send the user through
   Google's ownership/access-request UI. Do not create another location.
3. The business exists and is unclaimed: reuse the `GoogleLocation.location`
   returned by search when calling `locations.create`; do not construct a
   separate duplicate.
4. No matching business exists: validate the proposed location, obtain explicit
   user confirmation, then create it.

Google states that a newly created location is owned by the logged-in user. It
is therefore connected to the Google account that granted OAuth access, not
automatically owned by GlocalX. GlocalX may act on that account's behalf only
while its OAuth grant remains valid and only within the account's permissions.
Adding a GlocalX-controlled account as an owner or manager would be a separate,
explicit admin operation and is not part of the current onboarding flow.

## Status vocabulary

| Status            | Meaning                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Implemented       | A production HTTP call and response handling exist in the repository.                                       |
| Partial           | Some production behavior exists, but a required decision or safety path is incomplete.                      |
| Request spec only | The adapter constructs the Google request, but the user flow is not proven end to end against the live API. |
| Planned           | The API fits an identified product workflow but is not implemented.                                         |
| Blocked           | Code exists, but the operation must not be enabled until the named blocker is fixed.                        |

## Authentication and authorization

GBP uses OAuth 2.0 user authorization. API keys are not sufficient.

| Item           | GlocalX contract                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope          | `https://www.googleapis.com/auth/business.manage`                                                                                                                                |
| OAuth mode     | Authorization-code flow for a web server                                                                                                                                         |
| Offline access | Request a refresh token so scheduled publishing and sync can continue without an active browser session.                                                                         |
| Consent        | Explain that the scope permits management of every GBP account and location accessible to the consenting Google user. It is not restricted to the one store selected in GlocalX. |
| Token storage  | Encrypt refresh and access tokens at rest, associate them with the GlocalX store and Google principal, and never log them.                                                       |
| Revocation     | Disconnecting Google must revoke or delete stored credentials and disable all scheduled writes.                                                                                  |
| Identity       | Store the Google subject and email for display/audit, but authorize GBP operations from returned GBP resource names and roles.                                                   |

Current code keeps ordinary Google sign-in to `openid`, `email`, and `profile`.
The explicit GBP connection action additionally requests `business.manage`
with offline access and consent.

The Google Cloud project must have approved GBP API access and must enable each
API used below. Redirect URIs must exactly match the deployed callback URL. Keep
client secrets and token-encryption keys in deployment secrets; never place
them in this document or client-side code.

Official references: [GBP basic setup](https://developers.google.com/my-business/content/basic-setup)
and [OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server).

## API catalog

All entries use the `business.manage` scope.

| Product                 | Method                                                                                     | GlocalX use                                                                   | Status                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Account Management v1   | `GET /v1/accounts`                                                                         | Discover GBP accounts accessible to the connected user.                       | Partial: one account is supported; multiple accounts stop registration until a picker is added.   |
| Business Information v1 | `GET /v1/{parent=accounts/*}/locations`                                                    | List manageable locations for account selection and duplicate resolution.     | Planned                                                                                           |
| Business Information v1 | `GET /v1/{name=locations/*}`                                                               | Read canonical profile data and metadata.                                     | Planned                                                                                           |
| Business Information v1 | `GET /v1/categories`                                                                       | Search Google categories for the selected region and language.                | Partial: creation proceeds only on one exact display-name match; category selection is planned.   |
| Google My Business v4   | `POST /v4/googleLocations:search`                                                          | Search for an existing Google listing before create.                          | Partial: every returned match stops creation; attach, claim, and unclaimed reuse are planned.     |
| Business Information v1 | `POST /v1/{parent=accounts/*}/locations?validateOnly=true`                                 | Validate a proposed create request without mutating Google.                   | Implemented                                                                                       |
| Business Information v1 | `POST /v1/{parent=accounts/*}/locations`                                                   | Create a new storefront after validation and explicit confirmation.           | Implemented for one account, an exact category, and zero search matches; live smoke test pending. |
| Business Information v1 | `PATCH /v1/{location.name=locations/*}`                                                    | Update profile fields using an explicit update mask.                          | Planned                                                                                           |
| Business Information v1 | `GET /v1/{name=locations/*}:getGoogleUpdated`                                              | Detect Google-applied profile changes before overwriting them.                | Planned                                                                                           |
| Account Management v1   | `GET/POST/PATCH/DELETE /v1/{parent=locations/*}/admins...`                                 | Display or deliberately change location owners/managers.                      | Planned; never part of implicit onboarding.                                                       |
| Verifications v1        | `POST /v1/{location=locations/*}:fetchVerificationOptions`                                 | Show verification methods Google currently allows.                            | Planned                                                                                           |
| Verifications v1        | `POST /v1/{name=locations/*}:verify`                                                       | Start the user-selected verification method.                                  | Planned                                                                                           |
| Verifications v1        | `POST /v1/{name=locations/*/verifications/*}:complete`                                     | Submit a PIN where the chosen method requires one.                            | Planned                                                                                           |
| Verifications v1        | `GET /v1/{name=locations/*}:getVoiceOfMerchantState`                                       | Determine whether the merchant can act on Google and what action is required. | Planned                                                                                           |
| Google My Business v4   | `POST /v4/{parent=accounts/*/locations/*}/localPosts`                                      | Publish an approved local post.                                               | Blocked: the current publish flow uses stub credentials and resource names.                       |
| Google My Business v4   | `GET /v4/{parent=accounts/*/locations/*}/localPosts` and get/patch/delete                  | Reconcile, edit, and delete GlocalX-created posts.                            | Planned                                                                                           |
| Google My Business v4   | `POST /v4/{parent=accounts/*/locations/*}/media:startUpload` plus media create/list/delete | Upload and manage profile or post media.                                      | Planned                                                                                           |
| Google My Business v4   | `GET /v4/{parent=accounts/*/locations/*}/reviews`                                          | Sync customer reviews.                                                        | Request spec only                                                                                 |
| Google My Business v4   | `PUT /v4/{name=accounts/*/locations/*/reviews/*}/reply`                                    | Publish an approved owner reply.                                              | Request spec only                                                                                 |
| Google My Business v4   | `DELETE /v4/{name=accounts/*/locations/*/reviews/*}/reply`                                 | Remove a GlocalX-published owner reply.                                       | Planned                                                                                           |
| Performance v1          | `GET /v1/{location=locations/*}:fetchMultiDailyMetricsTimeSeries`                          | Fetch daily discovery and action metrics.                                     | Request spec and dashboard integration exist; live credential smoke test required.                |
| Performance v1          | `GET /v1/{parent=locations/*}/searchkeywords/impressions/monthly`                          | Show monthly search terms that surfaced the business.                         | Planned                                                                                           |
| Notifications v1        | `PATCH /v1/{name=accounts/*/notificationSetting}`                                          | Send account events to a Pub/Sub topic for faster synchronization.            | Evaluate later; polling is simpler for the MVP.                                                   |

## Registration and connection lifecycle

### 1. Discover accounts and existing locations

Call [`accounts.list`](https://developers.google.com/my-business/reference/accountmanagement/rest/v1/accounts/list),
then let the user choose an account when more than one eligible account is
returned. Do not silently use `accounts[0]`.

For each candidate account, call
[`accounts.locations.list`](https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations/list)
with a `readMask`. Use it to recognize locations the current user already
manages before attempting a public Google location search.

Persist full resource names returned by Google:

- account: `accounts/{accountId}`
- Business Information location: `locations/{locationId}`
- v4 parent, where required: `accounts/{accountId}/locations/{locationId}`

Do not assume every API accepts the same resource-name shape.

### 2. Resolve a Google category

Use [`categories.list`](https://developers.google.com/my-business/reference/businessinformation/rest/v1/categories/list)
with the store's `regionCode` and `languageCode`. Its `filter` performs a prefix
match on Google's display name. It does not translate arbitrary Naver taxonomy
strings into a definitive Google category.

The UI must present Google results and persist the selected category resource
name, for example `categories/gcid:coffee_shop`. Never choose the first result
without owner confirmation.

### 3. Search before creating

Call [`googleLocations.search`](https://developers.google.com/my-business/reference/rest/v4/googleLocations/search)
with the proposed location data. A returned `GoogleLocation` can represent a
location claimed by this user, claimed by someone else, or unclaimed.

Important behaviors:

- `requestAdminRightsUrl` means the listing is claimed by a user. Google notes
  that this may include the current user, so its presence alone does not prove
  that a different owner controls it.
- For an unclaimed result, `GoogleLocation.location` can be reused in
  `locations.create`. Preserve that object instead of reducing the result to a
  title and URL.
- Any plausible match must stop blind creation. The user must choose the exact
  managed or unclaimed result, follow Google's access flow, or explicitly state
  that none of the results is their business.

See the [`GoogleLocation` resource](https://developers.google.com/my-business/reference/rest/v4/googleLocations)
and Google's [ownership-request guidance](https://support.google.com/business/answer/4566671).

### 4. Validate and create

Use the same request body twice:

1. `validateOnly=true` to collect field-level validation errors.
2. `validateOnly=false` only after the user reviews the final Google-formatted
   profile and confirms the real-world mutation.

Generate a collision-resistant request ID from the complete material profile.
Reuse it for retries of the same logical create; change it when the proposed
location materially changes. The current flow persists a 15-minute, single-use
review intent bound to the store, Google subject, account, request ID, and exact
location payload before accepting the create mutation.

Google's
[`accounts.locations.create`](https://developers.google.com/my-business/reference/businessinformation/rest/v1/accounts.locations/create)
creates a location owned by the logged-in user. A successful response does not
mean the profile is verified or publicly visible.

## Onboarding-to-create payload mapping

The current request builder sends this shape:

```json
{
  "languageCode": "ko",
  "title": "Example Store",
  "storeCode": "stable-internal-store-code",
  "storefrontAddress": {
    "regionCode": "KR",
    "addressLines": ["full owner-confirmed address"]
  },
  "phoneNumbers": {
    "primaryPhone": "+82..."
  },
  "categories": {
    "primaryCategory": {
      "name": "categories/gcid:..."
    }
  }
}
```

Google's [`Location` resource](https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations)
supports this minimum unstructured address form. The current guarded flow is
limited to a new Korean storefront: one Google account, one exact category, no
search matches, and an explicit confirmation that customers visit the address.
It is not a safe general create flow for service-area or hybrid businesses.

| Google field or decision             | Current onboarding input     | Required change                                                                                                                                      |
| ------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                              | Store name                   | Validate Google's naming rules and show the exact final value.                                                                                       |
| `storefrontAddress` vs `serviceArea` | One address string           | Ask whether customers visit the address: storefront, service-area-only, or hybrid. Never send a storefront address for a service-area-only business. |
| `phoneNumbers.primaryPhone`          | Owner-confirmed phone        | Normalize and validate by region; do not require a phone when Google's resource permits omission.                                                    |
| `categories.primaryCategory`         | Naver category text          | Exact display-name matches are supported; add a Google category picker for all other cases.                                                          |
| `regularHours`                       | Hours text is collected      | Parse into Google's periods, validate overlaps/overnight hours, and send it. The current builder drops this field.                                   |
| `languageCode`                       | Korean onboarding            | The guarded Korean storefront flow sends `ko`; add a language choice before supporting other markets.                                                |
| Website                              | Not collected                | Optional, but collect and validate when available.                                                                                                   |
| Open date/status                     | Not collected                | Optional; add when needed for opening-soon and temporarily/ permanently closed workflows.                                                            |
| Coordinates                          | May be discovered from Naver | Use only as corroboration for duplicate matching; do not silently override Google's location.                                                        |
| Account                              | One eligible account         | Multiple accounts stop safely; add an account/location picker before supporting them.                                                                |

Field validation must be specific. A non-empty string check is not enough for
addresses, phone numbers, categories, or hours.

## Verification lifecycle

Creation and verification are separate. After create or claim:

1. Call
   [`fetchVerificationOptions`](https://developers.google.com/my-business/reference/verifications/rest/v1/locations/fetchVerificationOptions).
2. Show only the methods and destinations returned by Google.
3. Call [`locations.verify`](https://developers.google.com/my-business/reference/verifications/rest/v1/locations/verify)
   with the owner-selected method and its method-specific data.
4. If a PIN is required, submit it with
   [`verifications.complete`](https://developers.google.com/my-business/reference/verifications/rest/v1/locations.verifications/complete).
5. Reconcile state with
   [`getVoiceOfMerchantState`](https://developers.google.com/my-business/reference/verifications/rest/v1/locations/getVoiceOfMerchantState)
   and, when useful, list verification attempts.

Never invent a method or destination. Phone numbers and email addresses supplied
to `verify` must match the eligible option returned by Google. Service-area-only
businesses can require additional context.

The current code marks a created location as locally verification-pending. It
does not start or complete Google verification and must not infer `VERIFIED`
without reading Google state.

## Profile updates and Google changes

Use [`locations.get`](https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations/get)
and [`locations.patch`](https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations/patch)
with narrow read/update masks. Never issue broad replacement writes from stale
local data.

Before applying a local update, inspect
[`locations.getGoogleUpdated`](https://developers.google.com/my-business/reference/businessinformation/rest/v1/locations/getGoogleUpdated)
so the UI can show Google-originated changes and avoid overwriting them without
owner review. Add attributes through `attributes.list`, `locations.getAttributes`,
and `locations.updateAttributes` only after category/region support is known.

## Owners and managers

The Account Management `locations.admins` methods can list, create, patch, and
delete location administrators. They are appropriate for a future explicit
"team access" feature, not for onboarding side effects.

Before any admin mutation:

- show the target Google identity and role;
- explain owner versus manager capabilities;
- require an owner-authorized confirmation;
- record who initiated the change and Google's response;
- prevent GlocalX from removing the connected owner's access; and
- provide a clear offboarding path.

References: [`locations.admins.list`](https://developers.google.com/my-business/reference/accountmanagement/rest/v1/locations.admins/list),
[`locations.admins.create`](https://developers.google.com/my-business/reference/accountmanagement/rest/v1/locations.admins/create),
and Google's [owners and managers guide](https://support.google.com/business/answer/3403100).

## Posts and media

Create approved posts with
[`localPosts.create`](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.localPosts/create).
Persist the returned post resource name, create/update timestamps, and state so
GlocalX can reconcile or delete its own content.

Publishing prerequisites:

- a real store-scoped OAuth token;
- a confirmed Google account and location resource;
- a verified/eligible location state;
- explicit approval of the exact text, call to action, URL, and media;
- idempotency in GlocalX so retries do not create duplicate posts; and
- response parsing from Google's actual response, not from the outbound request.

The present publish workflow uses `stub-access-token` and a stub location parent
even in the production path. The production post operation is therefore blocked
until those values come from the connected store and the returned Google post is
persisted.

For uploads, use
[`media.startUpload`](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.media/startUpload)
and then [`media.create`](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.media/create).
Validate type, size, ownership, and rights before uploading. Use media list/get/
delete to reconcile only GlocalX-managed assets.

## Reviews and replies

Use [`reviews.list`](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list)
with pagination and persist Google's review name and update time. Never use
review text as an identifier.

Publish an approved reply with
[`reviews.updateReply`](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply).
The reply editor must show the review, exact proposed reply, acting business,
and Google account before mutation. Store Google's response and surface policy
rejections; Google can return policy-violation details for rejected replies.

The repository currently constructs review list and reply request specs, but a
live end-to-end execution path has not been established by this document's
review. Treat both as request-spec-only until covered by a gated credentialed
test.

## Performance and search keywords

Use
[`fetchMultiDailyMetricsTimeSeries`](https://developers.google.com/my-business/reference/performance/rest/v1/locations/fetchMultiDailyMetricsTimeSeries)
for the current and comparison date ranges. GlocalX currently requests:

- desktop Maps impressions;
- desktop Search impressions;
- mobile Maps impressions;
- mobile Search impressions;
- direction requests;
- call clicks; and
- website clicks.

Use Google's date and metric names as the source of truth, store the retrieval
time, and label partial periods. Do not imply that impressions are unique users.

Monthly search-term reporting can later use
[`searchkeywords.impressions.monthly.list`](https://developers.google.com/my-business/reference/performance/rest/v1/locations.searchkeywords.impressions.monthly/list).
It is paginated and should be treated as aggregate reporting data.

## Notifications

The Notifications API can associate an account with a Google Cloud Pub/Sub topic
through `accounts.updateNotificationSetting`. It is useful when review, location,
or Google-update latency becomes important. It also adds Pub/Sub IAM, delivery,
deduplication, and replay operations, so it is not required for the MVP.

Reference: [real-time notification setup](https://developers.google.com/my-business/content/notification-setup).

## Mutation guardrails

Every production write must satisfy all applicable checks:

- The GlocalX store, Google principal, account, and location association is
  explicit and active.
- The current token still has the required scope and Google role.
- Duplicate resolution completed before create.
- The user saw and confirmed the exact mutation.
- Create uses `validateOnly` before the real request.
- Post, reply, media, and profile updates are disabled until Google state permits
  them.
- A logical operation has an idempotency key and an audit record.
- Retries are bounded and safe for that method.
- Logs redact authorization headers, tokens, PINs, personal contact details, and
  request bodies that contain sensitive data.
- Disconnecting a store stops scheduled work before credentials are removed.

## Errors, retries, and observability

Preserve Google's HTTP status, structured error details, request context, and a
redacted correlation ID. Do not collapse every failure into "GBP unavailable."

| Condition                         | Handling                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400` validation error            | Map field violations back to the onboarding or editor field. Do not retry unchanged input.                                                                 |
| `401`                             | Refresh once when safe; if refresh fails, require reconnection.                                                                                            |
| `403`                             | Distinguish missing project approval/API enablement, insufficient Google role, unverified/ineligible location, and policy restriction. Do not blind-retry. |
| `404`                             | Mark the stored resource association stale and reconcile accounts/locations before another write.                                                          |
| `409` or duplicate-related detail | Stop creation and return to duplicate resolution.                                                                                                          |
| `429`                             | Honor server guidance and use exponential backoff with jitter.                                                                                             |
| `5xx`                             | Retry bounded read operations; retry writes only when idempotency makes the outcome safe.                                                                  |

Record operation type, store ID, Google resource names, actor, approval time,
attempt count, result, and redacted error details. Never record OAuth tokens or
verification PINs.

## Testing and rollout

Because there is no sandbox, divide testing into four layers:

1. Unit-test URL, method, query, mask, and body construction.
2. Contract-test response parsing with recorded, redacted fixtures.
3. Exercise OAuth and read-only calls against an explicitly authorized account.
4. Gate each live write behind a manual flag and owner confirmation. Prefer
   `validateOnly` for create testing and an existing authorized business for
   read-only checks; do not create fake public businesses.

Before expanding registration beyond the guarded new-Korean-storefront path,
complete these P0 items:

- add account and existing-location selection;
- preserve and branch on the complete `GoogleLocation` search result;
- support managed, claimed-by-another, unclaimed, and no-match outcomes;
- replace Naver-category first-match behavior with Google category confirmation;
- collect business type and map hours/language correctly;
- add field-specific validation beyond Google's validate-only call;
- implement verification state synchronization; and
- replace posting stubs with store-scoped credentials and resource names.

Then verify review execution, performance synchronization, token revocation,
audit logging, rate-limit behavior, and credentialed smoke tests before calling
those surfaces production-ready.

## Repository implementation map

| Concern                         | Source                                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| OAuth construction and callback | `src/auth/google-oauth.ts`, `src/gbp/oauth-callback.ts`                                                               |
| Registration orchestration      | `src/app/api/gbp/setup/route.ts` and GBP setup services                                                               |
| Business Information requests   | `src/integrations/production-business-information.ts`, `src/integrations/production-business-information-requests.ts` |
| Posts and reviews requests      | `src/integrations/production.ts`                                                                                      |
| Performance requests            | `src/integrations/production-performance.ts`                                                                          |
| Publish workflow                | `src/posts/post-flow.ts`                                                                                              |

Re-check Google's [GBP API reference](https://developers.google.com/my-business/reference/rest)
and [deprecation schedule](https://developers.google.com/my-business/content/sunset-dates)
before implementing a new surface. Some APIs still use v4 resource paths while
Business Information, Account Management, Verifications, Performance, and
Notifications use product-specific v1 endpoints.
