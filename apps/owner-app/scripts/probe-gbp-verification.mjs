// Reads the LIVE Google verification posture of one existing GBP listing, to
// answer the question Model A hinges on: what does Google actually offer on a
// listing our org created — an API-drivable method we can complete in-app, or
// only the UI/video flow no API can drive?
//
// STRICTLY READ-ONLY. It never calls `:verify` and never calls
// `:completeVerification`, so it cannot start, advance, or consume a
// verification attempt. Safe to re-run on a production listing.
//
// It mirrors, by hand, the adapter path the app runs:
//   google-org-auth.ts            (refresh token -> access token)
//   production.ts                 (the three mybusinessverifications specs)
//   domain/gbp-verification-state (the state interpretation, re-implemented
//                                  below — keep in sync if that module changes)
//
// Run from the repo root (values never echoed, never written to disk):
//
//   read -rs 'v?Client ID: ' GOOGLE_CLIENT_ID; echo
//   read -rs 'v?Client Secret: ' GOOGLE_CLIENT_SECRET; echo
//   read -rs 'v?Org Refresh Token: ' GOOGLE_ORG_REFRESH_TOKEN; echo
//   GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
//   GOOGLE_ORG_REFRESH_TOKEN="$GOOGLE_ORG_REFRESH_TOKEN" \
//   GBP_PROBE_LOCATION="locations/12345678901234567890" \
//   node apps/owner-app/scripts/probe-gbp-verification.mjs
//
// Find the location id in the app's gbp_locations table, or in the create
// response `name` field.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
const VERIFICATIONS_BASE = "https://mybusinessverifications.googleapis.com/v1"
// Matches production.ts — the listing is created in Korean, so the options and
// prompts Google returns should be read in the same language.
const LANGUAGE_CODE = "ko"

function fail(message) {
  console.error(`probe-gbp-verification: ${message}`)
  process.exit(1)
}

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

console.log(`\n[1/4] Exchanging org refresh token for an access token…`)
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
    return undefined
  }
  const text = await response.text()
  if (!response.ok) {
    console.error(`  ✗ ${label} HTTP ${response.status}`)
    console.error(text)
    return undefined
  }
  try {
    return JSON.parse(text === "" ? "{}" : text)
  } catch {
    console.error(`  ✗ ${label} returned unparseable body`)
    console.error(text)
    return undefined
  }
}

// --- 2. Voice of Merchant — the trusted verdict -----------------------------
// This, not a verify() response, is what the app persists: Google can accept a
// verification and then async-revert it (observed 2026-08-11 with AUTO).

console.log(`\n[2/4] GET ${locationName}/VoiceOfMerchantState`)
const vom = await callGoogle(
  "VoiceOfMerchantState",
  `${VERIFICATIONS_BASE}/${locationName}/VoiceOfMerchantState`,
  { method: "GET" }
)
if (vom !== undefined) {
  console.log(JSON.stringify(vom, null, 2))
}

// --- 3. the offered verification methods ------------------------------------
// Read-only despite being a POST: it reports eligibility, it does not start a
// verification.

console.log(`\n[3/4] POST ${locationName}:fetchVerificationOptions`)
const options = await callGoogle(
  "fetchVerificationOptions",
  `${VERIFICATIONS_BASE}/${locationName}:fetchVerificationOptions`,
  { method: "POST", body: JSON.stringify({ languageCode: LANGUAGE_CODE }) }
)
if (options !== undefined) {
  console.log(JSON.stringify(options, null, 2))
}

// --- 4. verifications already in flight --------------------------------------
// Shows whether a postcard is already mailed / a video review is pending, which
// changes what the operator should do next.

console.log(`\n[4/4] GET ${locationName}/verifications`)
const verifications = await callGoogle(
  "verifications.list",
  `${VERIFICATIONS_BASE}/${locationName}/verifications`,
  { method: "GET" }
)
if (verifications !== undefined) {
  console.log(JSON.stringify(verifications, null, 2))
}

// --- interpretation ---------------------------------------------------------
// Hand-mirrors interpretGbpVerificationState in
// packages/domain/src/gbp-verification-state.ts so the probe reports the same
// state the app would persist for this listing.

const API_DRIVABLE = ["ADDRESS", "PHONE_CALL", "SMS", "EMAIL"]

const offeredMethods = (options?.options ?? [])
  .map((option) => option?.verificationMethod)
  .filter((method) => typeof method === "string")

function interpret() {
  if (vom === undefined) return "UNKNOWN"
  if (vom.hasVoiceOfMerchant === true) return "VERIFIED"
  if (vom.waitForVoiceOfMerchant !== undefined) return "PENDING_REVIEW"
  if (vom.verify !== undefined) {
    return offeredMethods.some((method) => API_DRIVABLE.includes(method))
      ? "NEEDS_VERIFICATION"
      : "NEEDS_CONCIERGE"
  }
  return "NEEDS_CONCIERGE"
}

const state = interpret()
const drivable = offeredMethods.filter((method) =>
  API_DRIVABLE.includes(method)
)

console.log(`\n${"─".repeat(70)}`)
console.log(`Listing:            ${locationName}`)
console.log(
  `Offered methods:    ${offeredMethods.length > 0 ? offeredMethods.join(", ") : "(none)"}`
)
console.log(
  `API-drivable:       ${drivable.length > 0 ? drivable.join(", ") : "(none — in-app PIN entry is impossible here)"}`
)
console.log(`App would persist:  ${state}`)
console.log(`${"─".repeat(70)}`)

if (state === "NEEDS_CONCIERGE") {
  console.log(
    `\nThis listing cannot be verified through our own UI. Confirm in a browser\n` +
      `(signed in as the org account) what Google's remaining flow demands —\n` +
      `live video capture vs. an upload, and whether it accepts a manager other\n` +
      `than the account that created the listing. That answer decides whether the\n` +
      `Model A concierge is executable at all.`
  )
}

process.exit(vom === undefined ? 1 : 0)
