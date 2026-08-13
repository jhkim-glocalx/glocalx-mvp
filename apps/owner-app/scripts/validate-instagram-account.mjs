// Read-ONLY check that the Instagram publishing credentials the owner app uses
// (INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_USER_ID) can actually reach the business
// account and are eligible to publish — WITHOUT posting anything. Use it, like
// validate-gbp-location.mjs, to prove a channel is live-ready before flipping
// APP_INTEGRATION_MODE to production.
//
// This targets the Instagram API with Instagram Login (graph.instagram.com),
// matching the adapter in packages/integrations/src/instagram.ts. The token is
// an Instagram user access token (from Instagram business login, with the
// instagram_business_basic + instagram_business_content_publish permissions),
// NOT a Facebook Page token. The account must be added as an Instagram Tester
// (app → Roles) before its token can be generated in development.
//
// Instagram's Graph API has no "validateOnly" publish, so this deliberately
// makes only GET calls: it NEVER creates a media container or publishes a post.
// It hits the same host/version the adapter uses (instagram.ts, graph v24.0) —
// keep the version in sync if that adapter changes.
//
// INSTAGRAM_USER_ID is the NUMERIC Instagram user id, never the @handle — the
// Graph API cannot load a node by username. Omit it and this resolves it from
// the token via /me, exactly as instagram-oauth.ts does when it stores
// accountRef, then prints the id to register as INSTAGRAM_USER_ID.
//
// Run from the repo root (token never echoed):
//
//   printf 'Instagram Access Token: '; read -rs INSTAGRAM_ACCESS_TOKEN; echo
//   INSTAGRAM_ACCESS_TOKEN="$INSTAGRAM_ACCESS_TOKEN" \
//   node apps/owner-app/scripts/validate-instagram-account.mjs
//
// Pass INSTAGRAM_USER_ID="17841400000000000" as well to additionally prove that
// exact (token, id) PAIR works — which is what the publish adapter actually uses.

const GRAPH_API_VERSION = "v24.0"
const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`

function fail(message) {
  console.error(`validate-instagram-account: ${message}`)
  process.exit(1)
}

const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
const suppliedUserId = process.env.INSTAGRAM_USER_ID?.trim()

if (!accessToken || accessToken.trim() === "") {
  fail("missing env vars: INSTAGRAM_ACCESS_TOKEN")
}
// Caught here rather than at Meta, whose error for a handle ("Object with ID
// 'glocalx_ai' does not exist") reads like a broken token or a missing
// permission and sends you debugging the wrong thing.
if (suppliedUserId !== undefined && !/^\d+$/.test(suppliedUserId)) {
  fail(
    `INSTAGRAM_USER_ID must be the numeric Instagram user id, got "${suppliedUserId}".\n` +
      `  That looks like an @handle. The Graph API cannot load a node by username.\n` +
      `  Re-run without INSTAGRAM_USER_ID and this will resolve the numeric id for you.`
  )
}

// GET the Graph API and surface Meta's own error body on failure — the error is
// the whole point of the check, so it is never swallowed.
async function graphGet(path, params, label) {
  const url = new URL(`${GRAPH_BASE}/${path}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  url.searchParams.set("access_token", accessToken)
  // Log the path without the token so a shared terminal never leaks it.
  const shown = new URLSearchParams(params).toString()
  console.log(`  GET ${GRAPH_BASE}/${path}?${shown}&access_token=***`)

  let response
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(15000),
    })
  } catch (caught) {
    fail(`${label} request failed: ${caught?.message ?? caught}`)
  }
  const text = await response.text()
  if (!response.ok) {
    console.error(`\n❌ ${label} — Meta returned HTTP ${response.status}:`)
    console.error(text)
    process.exit(1)
  }
  try {
    return JSON.parse(text)
  } catch {
    fail(`${label} returned a non-JSON body: ${text.slice(0, 200)}`)
  }
}

// --- 1. token can reach the IG business account ------------------------------
// Two shapes on purpose. Reading /me proves the token is valid and tells us the
// numeric id — the discovery path. Reading the node BY INSTAGRAM_USER_ID proves
// the exact (token, id) PAIR the publish adapter uses, so a mismatched id fails
// here rather than at publish time. On the Instagram-login path the node exposes
// user_id/username/account_type (no Facebook "name" field).

console.log(`\n[1/2] Reading the Instagram business account…`)
const identity = await graphGet(
  suppliedUserId ?? "me",
  { fields: "user_id,username,account_type" },
  suppliedUserId ? "account read" : "identity read (/me)"
)
// instagram-oauth.ts:213 stores user_id as accountRef; `id` is the fallback the
// same way, so the publish id this prints is the one the app would have stored.
const resolvedUserId = String(
  identity.user_id ?? identity.id ?? suppliedUserId ?? ""
)
if (resolvedUserId === "") {
  fail(
    `Meta returned neither user_id nor id, so there is no publish id to use:\n` +
      `  ${JSON.stringify(identity)}`
  )
}
console.log(
  `  ✓ @${identity.username ?? "(no username)"}` +
    (identity.account_type ? ` — ${identity.account_type}` : "") +
    ` (publish id ${resolvedUserId})`
)
if (suppliedUserId === undefined) {
  console.log(
    `\n  → INSTAGRAM_USER_ID="${resolvedUserId}"   ← use this id, not the @handle`
  )
}

const igUserId = resolvedUserId

// --- 2. account is eligible to publish (read-only quota probe) ---------------
// content_publishing_limit is a GET that only a Business/Creator account wired
// for the Content Publishing API can return, so it doubles as the "can this
// account publish at all?" gate — without publishing.

console.log(`\n[2/2] Checking content publishing eligibility + quota…`)
const limit = await graphGet(
  `${igUserId}/content_publishing_limit`,
  { fields: "config,quota_usage" },
  "content_publishing_limit"
)
const entry = Array.isArray(limit.data) ? limit.data[0] : undefined
const quotaTotal = entry?.config?.quota_total
const quotaUsage = entry?.quota_usage
console.log(
  `  ✓ eligible to publish` +
    (quotaUsage !== undefined && quotaTotal !== undefined
      ? ` — ${quotaUsage}/${quotaTotal} posts used in the rolling window`
      : "")
)

console.log(
  `\n✅ INSTAGRAM CREDENTIALS OK — the token reaches @${identity.username ?? igUserId} ` +
    `and the account is publish-eligible. No post was created.` +
    `\n   Publish id for INSTAGRAM_USER_ID / SMOKE_IG_USER_ID: ${igUserId}`
)
