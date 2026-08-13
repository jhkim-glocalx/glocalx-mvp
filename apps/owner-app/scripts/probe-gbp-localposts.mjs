// Read-only probe answering one question: can the org token PUBLISH POSTS to a
// GBP listing? Posts never moved to the v1 Business Profile APIs — they still
// live on the legacy v4 host (mybusiness.googleapis.com), which is a SEPARATE
// Cloud API that must be enabled on its own, so location access proving out
// (validate-gbp-location.mjs) does NOT imply post access.
//
// It walks the same path production.ts createLocalPost would take, but stops at
// a GET. It CREATES NOTHING and DELETES NOTHING — no post, no draft, no media.
//
// Why it starts from accounts.list instead of GOOGLE_BUSINESS_ACCOUNT_ID: the
// v4 post path is accounts/{account}/locations/{location}/localPosts, and a
// listing created by hand in the OWNER's Google account (with GlocalX only
// granted manager access) hangs off the OWNER's account id, not ours. Probing
// the env account id alone would false-fail on exactly that case.
//
// Run from the repo root (values never echoed, never in shell history):
//
//   printf 'Client ID: '; read -rs GOOGLE_CLIENT_ID; echo
//   printf 'Client Secret: '; read -rs GOOGLE_CLIENT_SECRET; echo
//   printf 'Org Refresh Token: '; read -rs GOOGLE_ORG_REFRESH_TOKEN; echo
//   GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
//   GOOGLE_ORG_REFRESH_TOKEN="$GOOGLE_ORG_REFRESH_TOKEN" \
//   GBP_PROBE_LOCATION_QUERY="글로컬엑스" \
//   node apps/owner-app/scripts/probe-gbp-localposts.mjs
//
// GBP_PROBE_LOCATION_QUERY (optional) matches a substring of the listing title;
// without it the probe targets the first listing it finds and says so.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
const ACCOUNT_MGMT_BASE =
  "https://mybusinessaccountmanagement.googleapis.com/v1"
const BIZ_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"
const LEGACY_V4_BASE = "https://mybusiness.googleapis.com/v4"

// locations.list rejects requests without an explicit readMask.
const LOCATION_READ_MASK = "name,title,storefrontAddress,metadata"

function fail(message) {
  console.error(`\nprobe-gbp-localposts: ${message}`)
  process.exit(1)
}

async function getJson(url, accessToken, label) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  })
  const body = await response.text()
  if (!response.ok) {
    return { ok: false, status: response.status, body }
  }
  try {
    return { ok: true, status: response.status, json: JSON.parse(body) }
  } catch {
    fail(`${label} returned non-JSON (HTTP ${response.status})`)
  }
}

// --- credentials ------------------------------------------------------------

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const refreshToken = process.env.GOOGLE_ORG_REFRESH_TOKEN
const locationQuery = process.env.GBP_PROBE_LOCATION_QUERY?.trim()

const missing = [
  ["GOOGLE_CLIENT_ID", clientId],
  ["GOOGLE_CLIENT_SECRET", clientSecret],
  ["GOOGLE_ORG_REFRESH_TOKEN", refreshToken],
]
  .filter(([, value]) => !value || value.trim() === "")
  .map(([name]) => name)
if (missing.length > 0) fail(`missing env vars: ${missing.join(", ")}`)

console.log(
  "probe-gbp-localposts: READ-ONLY. Creates nothing, deletes nothing."
)

// --- 1. refresh token -> access token (mirrors google-org-auth.ts) ----------

console.log(`\n[1/4] Exchanging refresh token for an access token…`)
const tokenRes = await fetch(TOKEN_ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }).toString(),
  signal: AbortSignal.timeout(15_000),
})
if (!tokenRes.ok) {
  const body = await tokenRes.text()
  fail(
    `token exchange failed (HTTP ${tokenRes.status}): ${body}\n` +
      `  invalid_grant => the refresh token is revoked/expired or was minted\n` +
      `  with a different client id/secret than the ones supplied here.`
  )
}
const { access_token: accessToken, scope } = await tokenRes.json()
if (!accessToken) fail("token exchange returned no access_token")
console.log(`  ✓ access token obtained (not printed)`)
// The scope is the single best predictor of whether step 4 can work at all:
// business.manage covers both the v1 APIs and legacy v4.
if (scope) console.log(`  granted scope: ${scope}`)
if (scope && !scope.includes("business.manage")) {
  console.log(
    `  ⚠️  business.manage is NOT in the granted scope — steps 2-4 will 403.`
  )
}

// --- 2. which GBP accounts can this token see? ------------------------------

console.log(`\n[2/4] GET ${ACCOUNT_MGMT_BASE}/accounts`)
const accounts = []
let accountsPageToken
do {
  const url = new URL(`${ACCOUNT_MGMT_BASE}/accounts`)
  url.searchParams.set("pageSize", "20")
  if (accountsPageToken) url.searchParams.set("pageToken", accountsPageToken)

  const result = await getJson(url.toString(), accessToken, "accounts.list")
  if (!result.ok) {
    fail(
      `accounts.list failed (HTTP ${result.status}): ${result.body}\n` +
        `  403 here means the Business Profile APIs are not enabled/approved\n` +
        `  for this Cloud project, or the account has no GBP access.`
    )
  }
  accounts.push(...(result.json.accounts ?? []))
  accountsPageToken = result.json.nextPageToken
} while (accountsPageToken)

if (accounts.length === 0) fail("no GBP accounts visible to this token")
console.log(`  ✓ ${accounts.length} account(s):`)
for (const account of accounts) {
  console.log(
    `    - ${account.name}  "${account.accountName ?? "?"}"` +
      `  type=${account.type ?? "?"} role=${account.role ?? "?"}`
  )
}

// --- 3. find the listing to probe -------------------------------------------

console.log(`\n[3/4] Listing locations under each account…`)
const found = []
for (const account of accounts) {
  let locationsPageToken
  do {
    const url = new URL(`${BIZ_INFO_BASE}/${account.name}/locations`)
    url.searchParams.set("readMask", LOCATION_READ_MASK)
    url.searchParams.set("pageSize", "100")
    if (locationsPageToken)
      url.searchParams.set("pageToken", locationsPageToken)

    const result = await getJson(url.toString(), accessToken, "locations.list")
    if (!result.ok) {
      // A single inaccessible account must not abort the probe — the listing we
      // care about may well live under one of the others.
      console.log(
        `    ! ${account.name}: locations.list HTTP ${result.status} (skipped)`
      )
      break
    }
    for (const location of result.json.locations ?? []) {
      found.push({ accountName: account.name, location })
    }
    locationsPageToken = result.json.nextPageToken
  } while (locationsPageToken)
}

if (found.length === 0) fail("no locations visible under any account")
console.log(`  ✓ ${found.length} location(s):`)
for (const { accountName, location } of found) {
  const address = location.storefrontAddress?.addressLines?.join(" ") ?? ""
  // hasVoiceOfMerchant is the per-listing publish gate that step 4's
  // account-level 200 does NOT cover: an unverified listing stays readable but
  // never publishable. Do NOT reintroduce metadata.canOperateLocalPost here —
  // it reads like the exact right flag but Google deprecated it ("no longer
  // populated"), so it is false on every listing including verified ones.
  const meta = location.metadata ?? {}
  const vom = meta.hasVoiceOfMerchant === true ? "verified" : "NOT-verified"
  console.log(
    `    - ${accountName}/${location.name}  "${location.title ?? "?"}"  ${address}`
  )
  console.log(`        ${vom}`)
}

const matches = locationQuery
  ? found.filter(({ location }) =>
      (location.title ?? "").includes(locationQuery)
    )
  : found
if (locationQuery && matches.length === 0) {
  fail(
    `no location title contains "${locationQuery}" — pick one from the list above`
  )
}
const target = matches[0]
console.log(
  `\n  → probing: "${target.location.title}" (${target.accountName}/${target.location.name})` +
    (locationQuery ? "" : `  [no GBP_PROBE_LOCATION_QUERY set, took the first]`)
)

// --- 4. the actual unknown: legacy v4 localPosts -----------------------------

const postsPath = `${target.accountName}/${target.location.name}/localPosts`
console.log(`\n[4/4] GET ${LEGACY_V4_BASE}/${postsPath}`)
const postsRes = await fetch(`${LEGACY_V4_BASE}/${postsPath}?pageSize=5`, {
  headers: { Authorization: `Bearer ${accessToken}` },
  signal: AbortSignal.timeout(15_000),
})
const postsBody = await postsRes.text()

if (postsRes.ok) {
  let count = "?"
  try {
    count = (JSON.parse(postsBody).localPosts ?? []).length
  } catch {
    /* body shape is secondary; the 200 is the signal */
  }
  console.log(
    `\n✅ v4 localPosts IS reachable (HTTP ${postsRes.status}, ${count} existing post(s)).\n` +
      `   The legacy API is enabled and this token can manage posts on this\n` +
      `   listing. createLocalPost in production.ts can target it as-is.`
  )
  if (postsBody.trim() !== "") console.log(`\n${postsBody}`)
  process.exit(0)
}

console.error(`\n❌ v4 localPosts returned HTTP ${postsRes.status}:`)
console.error(postsBody)
console.error(
  `\nHow to read this:\n` +
    `  403 SERVICE_DISABLED / "has not been used in project" →\n` +
    `      the legacy "Google My Business API" is not enabled. Enable it at\n` +
    `      console.cloud.google.com/apis/library (it is only VISIBLE to Google\n` +
    `      accounts approved via the Business Profile API access request).\n` +
    `  403 PERMISSION_DENIED with quota 0 →\n` +
    `      project enabled but not approved; submit the access request form.\n` +
    `  403 with a role complaint →\n` +
    `      the token's account lacks a post-capable role on this listing.\n` +
    `  404 → wrong account/location pairing for the v4 path.`
)
process.exit(1)
