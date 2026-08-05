// Dry-runs the LIVE Google Business Profile locations.create body the owner app
// assembles in production, stopping at Google's `validateOnly=true` check — it
// NEVER creates a real location. Use it once the org GBP credentials + geocoding
// key are provisioned to prove the geocoded, category-carrying body is accepted
// by Google before flipping APP_INTEGRATION_MODE to production.
//
// It mirrors, by hand, the exact adapter path the app runs:
//   geocoding-production.ts (address -> parts + latlng)
//   setup-live.ts assembleLiveLocation (the create body)
//   google-org-auth.ts (refresh token -> access token, accounts/<id>)
//   production.ts buildGoogleLocationValidationRequest (validateOnly=true)
// Keep it in sync if those change.
//
// Run from the repo root (values never echoed):
//
//   read -rs 'v?Client ID: ' GOOGLE_CLIENT_ID; echo
//   read -rs 'v?Client Secret: ' GOOGLE_CLIENT_SECRET; echo
//   read -rs 'v?Org Refresh Token: ' GOOGLE_ORG_REFRESH_TOKEN; echo
//   read -rs 'v?Geocoding API Key: ' GOOGLE_GEOCODING_API_KEY; echo
//   GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
//   GOOGLE_ORG_REFRESH_TOKEN="$GOOGLE_ORG_REFRESH_TOKEN" \
//   GOOGLE_GEOCODING_API_KEY="$GOOGLE_GEOCODING_API_KEY" \
//   GOOGLE_BUSINESS_ACCOUNT_ID="108683171778167253197" \
//   GBP_VALIDATE_ADDRESS="서울 마포구 양화로 19" \
//   GBP_VALIDATE_CATEGORY_GCID="categories/gcid:restaurant" \
//   node apps/owner-app/scripts/validate-gbp-location.mjs
//
// Overridable inputs (env): GBP_VALIDATE_NAME, GBP_VALIDATE_ADDRESS,
// GBP_VALIDATE_PHONE, GBP_VALIDATE_CATEGORY_GCID, GBP_VALIDATE_STORE_CODE.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
const BIZ_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"

function fail(message) {
  console.error(`validate-gbp-location: ${message}`)
  process.exit(1)
}

// --- credentials + inputs ---------------------------------------------------

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const refreshToken = process.env.GOOGLE_ORG_REFRESH_TOKEN
const geocodingKey = process.env.GOOGLE_GEOCODING_API_KEY
const rawAccountId = process.env.GOOGLE_BUSINESS_ACCOUNT_ID

const missing = [
  ["GOOGLE_CLIENT_ID", clientId],
  ["GOOGLE_CLIENT_SECRET", clientSecret],
  ["GOOGLE_ORG_REFRESH_TOKEN", refreshToken],
  ["GOOGLE_GEOCODING_API_KEY", geocodingKey],
  ["GOOGLE_BUSINESS_ACCOUNT_ID", rawAccountId],
]
  .filter(([, value]) => !value || value.trim() === "")
  .map(([name]) => name)
if (missing.length > 0) fail(`missing env vars: ${missing.join(", ")}`)

const accountName = rawAccountId.startsWith("accounts/")
  ? rawAccountId
  : `accounts/${rawAccountId}`

const name = process.env.GBP_VALIDATE_NAME ?? "글로컬엑스 검증 매장"
const address = process.env.GBP_VALIDATE_ADDRESS ?? "서울 마포구 양화로 19"
// A format-valid Seoul placeholder — Google rejects obviously-fake subscriber
// numbers like 000-0000 with INVALID_PHONE_NUMBER, which would false-fail the
// default run. Override with a real store number via GBP_VALIDATE_PHONE.
const phone = process.env.GBP_VALIDATE_PHONE ?? "02-1234-5678"
const categoryId =
  process.env.GBP_VALIDATE_CATEGORY_GCID ?? "categories/gcid:restaurant"
const storeCode =
  process.env.GBP_VALIDATE_STORE_CODE ?? `gbp-validate-${Date.now()}`

// --- 1. geocode the address (mirrors geocoding-production.ts) ---------------

function findComponent(components, type) {
  const value = components.find((c) => c.types?.includes(type))?.long_name
  return value && value.trim() !== "" ? value.trim() : undefined
}

console.log(`\n[1/4] Geocoding address: ${address}`)
const geocodeUrl = new URL(GEOCODE_URL)
geocodeUrl.searchParams.set("address", address)
geocodeUrl.searchParams.set("language", "ko")
geocodeUrl.searchParams.set("region", "kr")
geocodeUrl.searchParams.set("key", geocodingKey)
// Log the URL without the key so a shared terminal never leaks it.
console.log(`  GET ${GEOCODE_URL}?address=…&language=ko&region=kr&key=***`)

let geocodeRes
try {
  geocodeRes = await fetch(geocodeUrl.toString(), {
    signal: AbortSignal.timeout(6000),
  })
} catch (caught) {
  fail(`geocoding request failed: ${caught?.message ?? caught}`)
}
if (!geocodeRes.ok) fail(`geocoding HTTP ${geocodeRes.status}`)
const geocodeJson = await geocodeRes.json()
if (geocodeJson.status !== "OK") {
  fail(
    `geocoding status=${geocodeJson.status}` +
      (geocodeJson.error_message ? ` (${geocodeJson.error_message})` : "")
  )
}
const first = geocodeJson.results?.[0]
if (!first) fail("geocoding returned no results")

const components = first.address_components ?? []
const administrativeArea = findComponent(
  components,
  "administrative_area_level_1"
)
const locality =
  findComponent(components, "locality") ??
  findComponent(components, "sublocality_level_1")
const postalCode = findComponent(components, "postal_code")
const sublocality = findComponent(components, "sublocality_level_2")
const latlng = first.geometry?.location

const gaps = [
  administrativeArea === undefined ? "administrativeArea" : null,
  locality === undefined ? "locality" : null,
  postalCode === undefined ? "postalCode" : null,
  latlng?.lat === undefined || latlng?.lng === undefined ? "latlng" : null,
].filter(Boolean)
if (gaps.length > 0) {
  fail(
    `geocoding resolved but is missing required parts: ${gaps.join(", ")} — ` +
      `the app would return ADDRESS_NOT_GEOCODABLE here.`
  )
}
console.log(
  `  ✓ ${administrativeArea} / ${locality}` +
    (sublocality ? ` / ${sublocality}` : "") +
    ` / ${postalCode} @ ${latlng.lat},${latlng.lng}`
)

// --- 2. assemble the create body (mirrors setup-live.ts assembleLiveLocation)

const location = {
  languageCode: "ko",
  title: name,
  storeCode,
  storefrontAddress: {
    regionCode: "KR",
    languageCode: "ko",
    administrativeArea,
    locality,
    ...(sublocality === undefined ? {} : { sublocality }),
    postalCode,
    addressLines: [address],
  },
  latlng: { latitude: latlng.lat, longitude: latlng.lng },
  phoneNumbers: { primaryPhone: phone },
  categories: { primaryCategory: { name: categoryId } },
}
console.log(`\n[2/4] Assembled locations.create body:`)
console.log(JSON.stringify(location, null, 2))

// --- 3. mint the org access token (mirrors google-org-auth.ts) --------------

console.log(`\n[3/4] Exchanging org refresh token for an access token…`)
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

// --- 4. validateOnly=true (mirrors buildGoogleLocationValidationRequest) -----
// This is the whole point: prove Google ACCEPTS the body without creating a
// real location. We deliberately never send validateOnly=false here.

const requestId = `gbp-validate-${storeCode}`
const validateUrl = new URL(`${BIZ_INFO_BASE}/${accountName}/locations`)
validateUrl.searchParams.set("requestId", requestId)
validateUrl.searchParams.set("validateOnly", "true")

console.log(`\n[4/4] POST ${accountName}/locations?validateOnly=true`)
const validateRes = await fetch(validateUrl.toString(), {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(location),
  signal: AbortSignal.timeout(15000),
})
const validateBody = await validateRes.text()

if (validateRes.ok) {
  console.log(
    `\n✅ VALIDATED — Google accepted the body (HTTP ${validateRes.status}). ` +
      `A real create (validateOnly=false) would use this exact body.`
  )
  if (validateBody.trim() !== "") console.log(validateBody)
  process.exit(0)
}

console.error(
  `\n❌ REJECTED — Google returned HTTP ${validateRes.status}. ` +
    `The body is not yet acceptable; details below:`
)
console.error(validateBody)
process.exit(1)
