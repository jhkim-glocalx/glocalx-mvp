// Reads back what Google ACTUALLY STORED for a live location, so a rendered
// address can be compared against the body we sent. Read-only: it issues a
// single GET and never writes, creates, or deletes anything.
//
// Why this exists: validateOnly consistently echoes a normalized
// storefrontAddress — Google strips the redundant 시/구 prefix from
// addressLines itself, in every region probed, with or without a trailing
// unit. Yet the listing created 2026-08-13 renders its 시/구 twice. Either the
// create path does not normalize the way the validate path does, or the
// duplication comes from something other than the stored addressLines. The
// stored record is the only thing that separates those.
//
// Run from the repo root (values never echoed):
//
//   GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
//   GOOGLE_ORG_REFRESH_TOKEN="$GOOGLE_ORG_REFRESH_TOKEN" \
//   GBP_LOCATION_ID="5660779507811783449" \
//   node apps/owner-app/scripts/inspect-gbp-location.mjs
//
// GBP_LOCATION_ID accepts a bare id or a full "locations/<id>" resource name.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
const BIZ_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"
const READ_MASK = "name,title,storefrontAddress,latlng,metadata"

function fail(message) {
  console.error(`inspect-gbp-location: ${message}`)
  process.exit(1)
}

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const refreshToken = process.env.GOOGLE_ORG_REFRESH_TOKEN
const rawLocationId = process.env.GBP_LOCATION_ID

const missing = [
  ["GOOGLE_CLIENT_ID", clientId],
  ["GOOGLE_CLIENT_SECRET", clientSecret],
  ["GOOGLE_ORG_REFRESH_TOKEN", refreshToken],
  ["GBP_LOCATION_ID", rawLocationId],
]
  .filter(([, value]) => !value || value.trim() === "")
  .map(([name]) => name)
if (missing.length > 0) fail(`missing env vars: ${missing.join(", ")}`)

const locationName = rawLocationId.startsWith("locations/")
  ? rawLocationId
  : `locations/${rawLocationId}`

console.log(`\nExchanging org refresh token for an access token…`)
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
  fail(
    `token exchange failed (HTTP ${tokenRes.status}): ${await tokenRes.text()}`
  )
}
const { access_token: accessToken } = await tokenRes.json()
if (!accessToken) fail("token exchange returned no access_token")
console.log(`  ✓ access token obtained (not printed)`)

const url = new URL(`${BIZ_INFO_BASE}/${locationName}`)
url.searchParams.set("readMask", READ_MASK)

console.log(`\nGET ${locationName}?readMask=${READ_MASK}`)
const response = await fetch(url.toString(), {
  headers: { Authorization: `Bearer ${accessToken}` },
  signal: AbortSignal.timeout(15000),
})
const body = await response.text()
if (!response.ok) {
  fail(`HTTP ${response.status}\n${body}`)
}

const location = JSON.parse(body)
console.log(`\n${"=".repeat(72)}`)
console.log(JSON.stringify(location, null, 2))
console.log(`${"=".repeat(72)}`)

const stored = location.storefrontAddress ?? {}
const rendered = [
  stored.administrativeArea,
  stored.locality,
  stored.sublocality,
  ...(stored.addressLines ?? []),
]
  .filter(Boolean)
  .join(" ")
console.log(`\nStored addressLines: ${JSON.stringify(stored.addressLines)}`)
console.log(`Concatenated as Google prints it:\n  "${rendered}"`)
console.log(
  `\nIf that repeats the 시/구, the create path stored the raw address and ` +
    `did NOT normalize the way validateOnly does.`
)
