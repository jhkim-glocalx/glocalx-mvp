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
// Keep it in sync if those change. The one piece it does NOT mirror by hand is
// the addressLines prefix stripping — it imports the app's own
// buildStorefrontAddressLines so this check can never validate a rule the app
// no longer applies.
//
// By default it sweeps a matrix of regions, because the bug this guards against
// (Google printing "대전광역시 유성구" and then the address repeating it) does
// NOT reproduce in Seoul — Seoul-style addresses get normalized by Google, other
// regions do not. Each address is validated TWICE: once with the raw confirmed
// address in addressLines (the old, duplicating body) and once with the prefix
// stripped (the current body), so any difference in Google's answer is visible.
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
//   node apps/owner-app/scripts/validate-gbp-location.mjs
//
// Overridable inputs (env): GBP_VALIDATE_NAME, GBP_VALIDATE_CATEGORY_GCID,
// GBP_VALIDATE_REQUEST_ID. Passing GBP_VALIDATE_ADDRESS (optionally with
// GBP_VALIDATE_PHONE) replaces the whole matrix with that single address.

import { buildStorefrontAddressLines } from "../src/gbp/address-lines.ts"

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

// Phone numbers are format-valid regional placeholders — Google rejects
// obviously-fake subscriber numbers like 000-0000 with INVALID_PHONE_NUMBER,
// and pairs an area code with the region, so each row carries its own.
const DEFAULT_MATRIX = [
  {
    label: "서울 (special city)",
    address: "서울 마포구 양화로 19",
    phone: "02-987-6543",
  },
  {
    label: "광역시 (the 하레 case)",
    address: "대전 유성구 어은로48번길 12",
    phone: "042-123-4567",
  },
  {
    label: "도 / 시 / 구",
    address: "경기도 성남시 분당구 판교로 235",
    phone: "031-123-4567",
  },
  {
    label: "도 / 군 / 면",
    address: "전남 구례군 마산면 화엄사로 539",
    phone: "061-123-4567",
  },
]

const singleAddress = process.env.GBP_VALIDATE_ADDRESS
const matrix =
  singleAddress && singleAddress.trim() !== ""
    ? [
        {
          label: "custom",
          address: singleAddress.trim(),
          phone: process.env.GBP_VALIDATE_PHONE ?? "02-1234-5678",
        },
      ]
    : DEFAULT_MATRIX

const name = process.env.GBP_VALIDATE_NAME ?? "글로컬엑스 검증 매장"
const categoryId =
  process.env.GBP_VALIDATE_CATEGORY_GCID ?? "categories/gcid:restaurant"
// Each validate call needs its own requestId; Google dedupes repeat calls that
// reuse one. The body itself carries no storeCode — the app stopped sending it.
const requestIdSeed =
  process.env.GBP_VALIDATE_REQUEST_ID ?? `gbp-validate-${Date.now()}`

// --- geocoding (mirrors geocoding-production.ts) -----------------------------

function findComponent(components, type) {
  const value = components.find((c) => c.types?.includes(type))?.long_name
  return value && value.trim() !== "" ? value.trim() : undefined
}

async function geocode(address) {
  const url = new URL(GEOCODE_URL)
  url.searchParams.set("address", address)
  url.searchParams.set("language", "ko")
  url.searchParams.set("region", "kr")
  url.searchParams.set("key", geocodingKey)

  let response
  try {
    response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(6000),
    })
  } catch (caught) {
    return { error: `geocoding request failed: ${caught?.message ?? caught}` }
  }
  if (!response.ok) return { error: `geocoding HTTP ${response.status}` }

  const json = await response.json()
  if (json.status !== "OK") {
    return {
      error:
        `geocoding status=${json.status}` +
        (json.error_message ? ` (${json.error_message})` : ""),
    }
  }
  const first = json.results?.[0]
  if (!first) return { error: "geocoding returned no results" }

  const components = first.address_components ?? []
  const parts = {
    administrativeArea: findComponent(
      components,
      "administrative_area_level_1"
    ),
    // Seoul-style special cities surface the gu as `locality`; most other
    // regions put it on `sublocality_level_1`, so accept either.
    locality:
      findComponent(components, "locality") ??
      findComponent(components, "sublocality_level_1"),
    sublocality: findComponent(components, "sublocality_level_2"),
    postalCode: findComponent(components, "postal_code"),
  }
  const latlng = first.geometry?.location

  const gaps = [
    parts.administrativeArea === undefined ? "administrativeArea" : null,
    parts.locality === undefined ? "locality" : null,
    parts.postalCode === undefined ? "postalCode" : null,
    latlng?.lat === undefined || latlng?.lng === undefined ? "latlng" : null,
  ].filter(Boolean)
  if (gaps.length > 0) {
    return {
      error:
        `geocoding resolved but is missing required parts: ${gaps.join(", ")} — ` +
        `the app would return ADDRESS_NOT_GEOCODABLE here.`,
    }
  }
  return { parts, latlng }
}

// --- body assembly (mirrors setup-live.ts assembleLiveLocation) --------------

function assemble({ row, parts, latlng, addressLines }) {
  return {
    languageCode: "ko",
    title: name,
    storefrontAddress: {
      regionCode: "KR",
      languageCode: "ko",
      administrativeArea: parts.administrativeArea,
      locality: parts.locality,
      ...(parts.sublocality === undefined
        ? {}
        : { sublocality: parts.sublocality }),
      postalCode: parts.postalCode,
      addressLines,
    },
    latlng: { latitude: latlng.lat, longitude: latlng.lng },
    phoneNumbers: { primaryPhone: row.phone },
    categories: { primaryCategory: { name: categoryId } },
  }
}

// --- org access token (mirrors google-org-auth.ts) ---------------------------

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
  const body = await tokenRes.text()
  fail(`token exchange failed (HTTP ${tokenRes.status}): ${body}`)
}
const { access_token: accessToken } = await tokenRes.json()
if (!accessToken) fail("token exchange returned no access_token")
console.log(`  ✓ access token obtained (not printed)`)

// --- validateOnly=true (mirrors buildGoogleLocationValidationRequest) --------
// This is the whole point: prove Google ACCEPTS the body without creating a
// real location. We deliberately never send validateOnly=false here.

async function validateOnly(location, requestId) {
  const url = new URL(`${BIZ_INFO_BASE}/${accountName}/locations`)
  url.searchParams.set("requestId", requestId)
  url.searchParams.set("validateOnly", "true")

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(location),
    signal: AbortSignal.timeout(15000),
  })
  return {
    status: response.status,
    ok: response.ok,
    body: await response.text(),
  }
}

// --- sweep -------------------------------------------------------------------

let index = 0
let failures = 0

for (const row of matrix) {
  index += 1
  console.log(`\n${"=".repeat(72)}`)
  console.log(`[${index}/${matrix.length}] ${row.label} — ${row.address}`)
  console.log("=".repeat(72))

  const geocoded = await geocode(row.address)
  if (geocoded.error) {
    console.error(`  ❌ ${geocoded.error}`)
    failures += 1
    continue
  }
  const { parts, latlng } = geocoded
  console.log(
    `  geocoded: ${parts.administrativeArea} / ${parts.locality}` +
      (parts.sublocality ? ` / ${parts.sublocality}` : "") +
      ` / ${parts.postalCode} @ ${latlng.lat},${latlng.lng}`
  )

  const stripped = buildStorefrontAddressLines(row.address, parts)
  const structuredPrefix = [
    parts.administrativeArea,
    parts.locality,
    parts.sublocality,
  ]
    .filter(Boolean)
    .join(" ")
  console.log(`\n  Google prints the structured prefix: "${structuredPrefix}"`)
  console.log(`  before (raw address):     "${row.address}"`)
  console.log(
    `    → would render as:      "${structuredPrefix} ${row.address}"`
  )
  console.log(`  after  (prefix stripped): "${stripped[0]}"`)
  console.log(
    `    → would render as:      "${structuredPrefix} ${stripped[0]}"`
  )

  for (const variant of [
    { tag: "before", addressLines: [row.address] },
    { tag: "after ", addressLines: stripped },
  ]) {
    const location = assemble({
      row,
      parts,
      latlng,
      addressLines: variant.addressLines,
    })
    const result = await validateOnly(
      location,
      `${requestIdSeed}-${index}-${variant.tag.trim()}`
    )
    if (result.ok) {
      console.log(
        `\n  ✅ ${variant.tag} — accepted (HTTP ${result.status})` +
          (result.body.trim() === "" ? "" : `\n     ${result.body.trim()}`)
      )
    } else {
      console.error(
        `\n  ❌ ${variant.tag} — REJECTED (HTTP ${result.status})\n     ${result.body}`
      )
      // Only the "after" body is the one the app actually sends; a rejected
      // "before" is informational, not a regression in this change.
      if (variant.tag.trim() === "after") failures += 1
    }
  }
}

console.log(`\n${"=".repeat(72)}`)
if (failures > 0) {
  console.error(
    `❌ ${failures} of ${matrix.length} address(es) failed with the body the app sends.`
  )
  process.exit(1)
}
console.log(
  `✅ All ${matrix.length} address(es) accepted with the prefix-stripped body ` +
    `the app sends. No location was created.`
)
