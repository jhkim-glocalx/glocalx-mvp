// Regenerates apps/owner-app/src/gbp/categories/gbp-categories-kr.json — the
// bundled snapshot of Korea Google Business Profile categories the owner picks
// from during GBP setup. The live categories.list search is unusable
// (filter=displayName returns unrelated results), so we snapshot the full KR
// list and search it locally instead.
//
// Requires the org Google account credentials (same account that manages the
// GlocalX GBP locations). Run from the repo root:
//
//   printf 'Client ID: '; read -rs GOOGLE_CLIENT_ID; echo
//   printf 'Client Secret: '; read -rs GOOGLE_CLIENT_SECRET; echo
//   printf 'Refresh Token: '; read -rs GOOGLE_ORG_REFRESH_TOKEN; echo
//   GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
//   GOOGLE_ORG_REFRESH_TOKEN="$GOOGLE_ORG_REFRESH_TOKEN" \
//   node apps/owner-app/scripts/refresh-gbp-categories.mjs

import { writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const refreshToken = process.env.GOOGLE_ORG_REFRESH_TOKEN

function fail(message) {
  console.error(`refresh-gbp-categories: ${message}`)
  process.exit(1)
}

const missing = [
  ["GOOGLE_CLIENT_ID", clientId],
  ["GOOGLE_CLIENT_SECRET", clientSecret],
  ["GOOGLE_ORG_REFRESH_TOKEN", refreshToken],
]
  .filter(([, value]) => !value || value.trim() === "")
  .map(([name]) => name)
if (missing.length > 0) fail(`missing env vars: ${missing.join(", ")}`)

const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }).toString(),
})
if (!tokenResponse.ok)
  fail(`token exchange failed (HTTP ${tokenResponse.status})`)
const { access_token: accessToken } = await tokenResponse.json()

const categories = []
let pageToken
let pages = 0
do {
  const url = new URL(`${BASE}/categories`)
  url.searchParams.set("regionCode", "KR")
  url.searchParams.set("languageCode", "ko")
  url.searchParams.set("view", "BASIC")
  url.searchParams.set("pageSize", "100")
  if (pageToken) url.searchParams.set("pageToken", pageToken)

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) fail(`categories.list failed (HTTP ${res.status})`)
  const json = await res.json()
  for (const category of json.categories ?? []) {
    if (category.name && category.displayName) {
      categories.push({
        name: category.name,
        displayName: category.displayName,
      })
    }
  }
  pageToken = json.nextPageToken
  pages += 1
  if (pages > 500) fail("unexpected pagination overrun")
} while (pageToken)

categories.sort((left, right) => left.name.localeCompare(right.name))

const outPath = fileURLToPath(
  new URL("../src/gbp/categories/gbp-categories-kr.json", import.meta.url)
)
await writeFile(outPath, JSON.stringify(categories), "utf8")
console.log(
  `refresh-gbp-categories: wrote ${categories.length} categories → ${outPath}`
)
