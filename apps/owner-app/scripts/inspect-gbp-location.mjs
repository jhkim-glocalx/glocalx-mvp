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
//   GOOGLE_BUSINESS_ACCOUNT_ID="108683171778167253197" \
//   GBP_LOCATION_ID="5660779507811783449" \
//   node apps/owner-app/scripts/inspect-gbp-location.mjs
//
// GBP_LOCATION_ID accepts a bare id or a full "locations/<id>" resource name.
// It is optional: with GOOGLE_BUSINESS_ACCOUNT_ID set the script lists the
// account's locations instead, which is also the fallback when a direct get
// 404s. The number in a Business Profile dashboard URL is usually a CID, a
// different id space from the API's location name, so a 404 there means "wrong
// id", not "no such listing" — the listing has to be found by name.
//
// GBP_LOCATION_TITLE filters that listing to titles containing the value.

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
const rawAccountId = process.env.GOOGLE_BUSINESS_ACCOUNT_ID
const titleFilter = process.env.GBP_LOCATION_TITLE

const missing = [
  ["GOOGLE_CLIENT_ID", clientId],
  ["GOOGLE_CLIENT_SECRET", clientSecret],
  ["GOOGLE_ORG_REFRESH_TOKEN", refreshToken],
]
  .filter(([, value]) => !value || value.trim() === "")
  .map(([name]) => name)
if (missing.length > 0) fail(`missing env vars: ${missing.join(", ")}`)
if (!rawLocationId && !rawAccountId) {
  fail(
    "set GBP_LOCATION_ID to read one location, or GOOGLE_BUSINESS_ACCOUNT_ID to list them"
  )
}

const locationName = rawLocationId
  ? rawLocationId.startsWith("locations/")
    ? rawLocationId
    : `locations/${rawLocationId}`
  : undefined
const accountName = rawAccountId
  ? rawAccountId.startsWith("accounts/")
    ? rawAccountId
    : `accounts/${rawAccountId}`
  : undefined

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

function report(location) {
  console.log(`\n${"=".repeat(72)}`)
  console.log(JSON.stringify(location, null, 2))
  console.log("=".repeat(72))

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
}

async function getLocation(name) {
  const url = new URL(`${BIZ_INFO_BASE}/${name}`)
  url.searchParams.set("readMask", READ_MASK)
  console.log(`\nGET ${name}?readMask=${READ_MASK}`)
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
  })
  return {
    ok: response.ok,
    status: response.status,
    body: await response.text(),
  }
}

async function listLocations(account) {
  const locations = []
  let pageToken
  do {
    const url = new URL(`${BIZ_INFO_BASE}/${account}/locations`)
    url.searchParams.set("readMask", READ_MASK)
    url.searchParams.set("pageSize", "100")
    if (pageToken) url.searchParams.set("pageToken", pageToken)
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20000),
    })
    const body = await response.text()
    if (!response.ok)
      fail(`listing ${account} failed (HTTP ${response.status}):\n${body}`)
    const page = JSON.parse(body)
    locations.push(...(page.locations ?? []))
    pageToken = page.nextPageToken
  } while (pageToken)
  return locations
}

if (locationName) {
  const result = await getLocation(locationName)
  if (result.ok) {
    report(JSON.parse(result.body))
    process.exit(0)
  }
  console.error(`\n⚠️  HTTP ${result.status}\n${result.body}`)
  if (!accountName) {
    fail(
      "set GOOGLE_BUSINESS_ACCOUNT_ID to search the account's listings by name instead"
    )
  }
  // A dashboard URL exposes a CID, not the API location name, so a 404 here is
  // usually the wrong id space rather than a missing listing.
  console.log(`\nFalling back to listing ${accountName} — the id may be a CID.`)
}

const locations = await listLocations(accountName)
console.log(`\n${locations.length} location(s) on ${accountName}`)

const matches = titleFilter
  ? locations.filter((location) => (location.title ?? "").includes(titleFilter))
  : locations
if (titleFilter) {
  console.log(`${matches.length} matching title containing "${titleFilter}"`)
}
if (matches.length === 0) {
  console.log("\nTitles on this account:")
  for (const location of locations) {
    console.log(`  ${location.name} — ${location.title}`)
  }
  process.exit(0)
}
for (const location of matches) {
  report(location)
}
