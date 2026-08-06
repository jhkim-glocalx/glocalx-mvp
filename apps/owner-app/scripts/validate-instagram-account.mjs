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
// Run from the repo root (token never echoed):
//
//   read -rs 'v?Instagram Access Token: ' INSTAGRAM_ACCESS_TOKEN; echo
//   INSTAGRAM_ACCESS_TOKEN="$INSTAGRAM_ACCESS_TOKEN" \
//   INSTAGRAM_USER_ID="17841400000000000" \
//   node apps/owner-app/scripts/validate-instagram-account.mjs

const GRAPH_API_VERSION = "v24.0"
const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`

function fail(message) {
  console.error(`validate-instagram-account: ${message}`)
  process.exit(1)
}

const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN
const igUserId = process.env.INSTAGRAM_USER_ID

const missing = [
  ["INSTAGRAM_ACCESS_TOKEN", accessToken],
  ["INSTAGRAM_USER_ID", igUserId],
]
  .filter(([, value]) => !value || value.trim() === "")
  .map(([name]) => name)
if (missing.length > 0) fail(`missing env vars: ${missing.join(", ")}`)

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

// --- 1. token can reach the configured IG business account ------------------
// Proves the exact (access token, user id) pair the adapter uses is valid and
// paired: querying the node BY INSTAGRAM_USER_ID means a wrong token, a revoked
// token, or a mismatched id all fail here. On the Instagram-login path the node
// exposes user_id/username/account_type (no Facebook "name" field).

console.log(`\n[1/2] Reading the Instagram business account…`)
const account = await graphGet(
  igUserId,
  { fields: "user_id,username,account_type" },
  "account read"
)
console.log(
  `  ✓ @${account.username ?? "(no username)"}` +
    (account.account_type ? ` — ${account.account_type}` : "") +
    ` (id ${account.user_id ?? account.id ?? igUserId})`
)

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
  `\n✅ INSTAGRAM CREDENTIALS OK — the token reaches @${account.username ?? igUserId} ` +
    `and the account is publish-eligible. No post was created.`
)
