// TODOS.md item 5: can our org account delete a GBP listing it created,
// through the Google API? Admin's OVERRIDE/detach path already unwinds our
// own DB rows (gbp_locations/gbp_accounts), but the listing stays live on
// Google — if an owner asks us to remove a wrongly-created listing, an
// operator currently has no in-app way to finish that.
//
// Defaults to READ-ONLY: it only calls locations.get to confirm the listing
// resolves and report its current verification state. It calls
// locations.delete ONLY when you pass --confirm-delete, because a delete
// against a real listing is irreversible and (per the design doc) may
// require the listing to be unverified first.
//
// Mirrors, by hand, the adapter path the app already runs:
//   google-org-auth.ts   (refresh token -> access token)
//   production.ts        (googleBusinessInformationBaseUrl, googleHeaders)
//
// Run from the repo root (values never echoed, never written to disk):
//
//   read -rs 'v?Client ID: ' GOOGLE_CLIENT_ID; echo
//   read -rs 'v?Client Secret: ' GOOGLE_CLIENT_SECRET; echo
//   read -rs 'v?Org Refresh Token: ' GOOGLE_ORG_REFRESH_TOKEN; echo
//   GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
//   GOOGLE_ORG_REFRESH_TOKEN="$GOOGLE_ORG_REFRESH_TOKEN" \
//   GBP_PROBE_LOCATION="locations/12345678901234567890" \
//   node apps/owner-app/scripts/probe-gbp-listing-deletion.mjs
//
// Add --confirm-delete only once you've read the GET output and are certain
// this is the safe test listing (org's own "글로컬엑스/부산 서면로 39"), never
// a real customer's listing:
//
//   ...node apps/owner-app/scripts/probe-gbp-listing-deletion.mjs --confirm-delete

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
const BUSINESS_INFO_BASE =
  "https://mybusinessbusinessinformation.googleapis.com/v1"

function fail(message) {
  console.error(`probe-gbp-listing-deletion: ${message}`)
  process.exit(1)
}

const confirmDelete = process.argv.includes("--confirm-delete")

// --- credentials + inputs ---------------------------------------------------

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const refreshToken = process.env.GOOGLE_ORG_REFRESH_TOKEN
const rawLocation = process.env.GBP_PROBE_LOCATION

const missing = [
  ["GOOGLE_CLIENT_ID", clientId],
  ["GOOGLE_CLIENT_SECRET", clientSecret],
  ["GOOGLE_ORG_REFRESH_TOKEN", refreshToken],
  ["GBP_PROBE_LOCATION", rawLocation],
]
  .filter(([, value]) => !value || value.trim() === "")
  .map(([name]) => name)
if (missing.length > 0) fail(`missing env vars: ${missing.join(", ")}`)

const locationName = rawLocation.startsWith("locations/")
  ? rawLocation.trim()
  : `locations/${rawLocation.trim()}`

// --- 1. mint the org access token (mirrors google-org-auth.ts) --------------

console.log(`\n[1/3] Exchanging org refresh token for an access token…`)
const tokenRes = await fetch(TOKEN_ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }).toString(),
})
if (!tokenRes.ok) {
  const body = await tokenRes.text()
  fail(`token exchange failed (HTTP ${tokenRes.status}): ${body}`)
}
const { access_token: accessToken } = await tokenRes.json()
if (!accessToken) fail("token exchange returned no access_token")
console.log(`  ✓ access token obtained (not printed)`)

async function callGoogle(label, url, init) {
  let response
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(15000),
    })
  } catch (caught) {
    console.error(`  ✗ ${label} request failed: ${caught?.message ?? caught}`)
    return { ok: false, status: undefined, body: undefined }
  }
  const text = await response.text()
  if (!response.ok) {
    console.error(`  ✗ ${label} HTTP ${response.status}`)
    console.error(text)
    return { ok: false, status: response.status, body: text }
  }
  try {
    return {
      ok: true,
      status: response.status,
      body: text === "" ? {} : JSON.parse(text),
    }
  } catch {
    console.error(`  ✗ ${label} returned unparseable body`)
    console.error(text)
    return { ok: false, status: response.status, body: text }
  }
}

// --- 2. confirm the listing resolves and report its state -------------------

console.log(`\n[2/3] GET ${locationName}?readMask=name,title,metadata`)
const getResult = await callGoogle(
  "locations.get",
  `${BUSINESS_INFO_BASE}/${locationName}?readMask=name,title,metadata`,
  { method: "GET" }
)
if (!getResult.ok) {
  fail(`could not resolve ${locationName} — aborting before any delete attempt`)
}
console.log(JSON.stringify(getResult.body, null, 2))
console.log(
  `\nTitle: ${getResult.body?.title ?? "(none)"}  ·  ` +
    `canDelete metadata field: ${JSON.stringify(getResult.body?.metadata?.canDelete)}`
)

// --- 3. delete, only with explicit opt-in ------------------------------------

if (!confirmDelete) {
  console.log(
    `\n[3/3] Skipped — rerun with --confirm-delete to actually call ` +
      `locations.delete on ${locationName}. Only do this against the ` +
      `designated safe test listing.`
  )
  process.exit(0)
}

console.log(`\n[3/3] DELETE ${locationName}  (--confirm-delete was passed)`)
const deleteResult = await callGoogle(
  "locations.delete",
  `${BUSINESS_INFO_BASE}/${locationName}`,
  { method: "DELETE" }
)

console.log(`\n${"─".repeat(70)}`)
if (deleteResult.ok) {
  console.log(
    `Result: Google accepted the delete (HTTP ${deleteResult.status}).`
  )
  console.log(
    `Re-run this script with the same GBP_PROBE_LOCATION (without ` +
      `--confirm-delete) to confirm locations.get now 404s.`
  )
} else {
  console.log(
    `Result: Google rejected the delete (HTTP ${deleteResult.status ?? "n/a"}).`
  )
  console.log(
    `A 403/PERMISSION_DENIED here on a VERIFIED listing likely means it must ` +
      `be unverified first — check VoiceOfMerchantState with ` +
      `probe-gbp-verification.mjs before retrying.`
  )
}
console.log(`${"─".repeat(70)}`)

process.exit(deleteResult.ok ? 0 : 1)
