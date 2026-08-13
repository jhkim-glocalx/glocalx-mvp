// ⚠️ THIS SCRIPT WRITES. Unlike probe-gbp-localposts.mjs, it CREATES A REAL POST
// on a REAL listing — publicly visible on Google Search/Maps the moment it lands
// — then deletes it. Deletion is in a finally block so a mid-run failure still
// cleans up. Exposure is seconds, but it is not zero.
//
// It proves the two things a GET could not: that this token can WRITE local
// posts, and that `callToAction` (the button + link seen in Business Profile
// Manager's "Add post") is accepted by the v4 API.
//
// SAFETY INTERLOCKS — the account also holds real client storefronts, so a
// mistyped id must not become a post on someone's business:
//   1. GBP_SMOKE_LOCATION must be passed in full; nothing defaults.
//   2. The listing's real title must contain GBP_SMOKE_EXPECT_TITLE.
//   3. GBP_SMOKE_CONFIRM must be exactly "yes".
//
// Run from the repo root (values never echoed):
//
//   printf 'Client ID: '; read -rs GOOGLE_CLIENT_ID; echo
//   printf 'Client Secret: '; read -rs GOOGLE_CLIENT_SECRET; echo
//   printf 'Refresh Token: '; read -rs GOOGLE_ORG_REFRESH_TOKEN; echo
//   GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
//   GOOGLE_ORG_REFRESH_TOKEN="$GOOGLE_ORG_REFRESH_TOKEN" \
//   GBP_SMOKE_LOCATION="accounts/108683171778167253197/locations/941049899414125596" \
//   GBP_SMOKE_EXPECT_TITLE="글로컬엑스" \
//   GBP_SMOKE_CONFIRM=yes \
//   node apps/owner-app/scripts/smoke-gbp-localpost.mjs
//
// Optional: GBP_SMOKE_CTA_URL (default https://glocalx-ai.com),
// GBP_SMOKE_IMAGE_URL (publicly reachable image — exercises the sourceUrl-only
// media path; omitted by default so a bad image URL cannot mask a CTA failure).

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
const BIZ_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"
const LEGACY_V4_BASE = "https://mybusiness.googleapis.com/v4"

function fail(message) {
  console.error(`\nsmoke-gbp-localpost: ${message}`)
  process.exit(1)
}

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const refreshToken = process.env.GOOGLE_ORG_REFRESH_TOKEN
const locationPath = process.env.GBP_SMOKE_LOCATION?.trim()
const expectTitle = process.env.GBP_SMOKE_EXPECT_TITLE?.trim()
const confirm = process.env.GBP_SMOKE_CONFIRM?.trim()
const ctaUrl = process.env.GBP_SMOKE_CTA_URL?.trim() ?? "https://glocalx-ai.com"
const imageUrl = process.env.GBP_SMOKE_IMAGE_URL?.trim()
const dwellSeconds = Number(process.env.GBP_SMOKE_DWELL_SECONDS ?? "0")
if (!Number.isFinite(dwellSeconds) || dwellSeconds < 0 || dwellSeconds > 300) {
  fail("GBP_SMOKE_DWELL_SECONDS must be a number between 0 and 300")
}

const missing = [
  ["GOOGLE_CLIENT_ID", clientId],
  ["GOOGLE_CLIENT_SECRET", clientSecret],
  ["GOOGLE_ORG_REFRESH_TOKEN", refreshToken],
  ["GBP_SMOKE_LOCATION", locationPath],
  ["GBP_SMOKE_EXPECT_TITLE", expectTitle],
]
  .filter(([, value]) => !value || value === "")
  .map(([name]) => name)
if (missing.length > 0) fail(`missing env vars: ${missing.join(", ")}`)

if (confirm !== "yes") {
  fail(
    `refusing to write without GBP_SMOKE_CONFIRM=yes.\n` +
      `  This script publishes a real, publicly visible post before deleting it.`
  )
}
if (!/^accounts\/\d+\/locations\/\d+$/.test(locationPath)) {
  fail(
    `GBP_SMOKE_LOCATION must look like accounts/{id}/locations/{id}, got: ${locationPath}`
  )
}

console.log(
  `smoke-gbp-localpost: ⚠️  WRITE TEST — creates then deletes a post.`
)

// --- 1. access token --------------------------------------------------------

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
if (!tokenRes.ok) fail(`token exchange failed (HTTP ${tokenRes.status})`)
const { access_token: accessToken } = await tokenRes.json()
if (!accessToken) fail("token exchange returned no access_token")
console.log(`  ✓ access token obtained (not printed)`)

const authHeaders = {
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
}

// --- 2. confirm we are pointed at the intended listing ----------------------
// The whole point of the interlock: resolve the id to a human title and refuse
// unless it is the one the operator named.

const locationId = locationPath.split("/").slice(-2).join("/") // locations/{id}
console.log(`\n[2/4] Verifying target listing identity…`)
const locRes = await fetch(
  `${BIZ_INFO_BASE}/${locationId}?readMask=name,title,storefrontAddress,metadata`,
  { headers: authHeaders, signal: AbortSignal.timeout(15_000) }
)
if (!locRes.ok) {
  fail(
    `could not read the location (HTTP ${locRes.status}): ${await locRes.text()}`
  )
}
const location = await locRes.json()
const title = location.title ?? ""
const address = location.storefrontAddress?.addressLines?.join(" ") ?? ""
console.log(`  target: "${title}"  ${address}`)
if (!title.includes(expectTitle)) {
  fail(
    `ABORTED — listing title "${title}" does not contain ` +
      `GBP_SMOKE_EXPECT_TITLE "${expectTitle}". Nothing was written.`
  )
}
if (location.metadata?.hasVoiceOfMerchant !== true) {
  fail(
    `ABORTED — listing is not verified (no Voice of Merchant), so a post would ` +
      `be rejected anyway. Nothing was written.`
  )
}
console.log(`  ✓ identity + verification confirmed`)

// --- 3. create the post -----------------------------------------------------

const postBody = {
  languageCode: "ko",
  summary:
    "글로컬엑스 API 연동 점검용 임시 게시물입니다. 확인 즉시 삭제됩니다.",
  topicType: "STANDARD",
  callToAction: { actionType: "LEARN_MORE", url: ctaUrl },
  ...(imageUrl
    ? { media: [{ mediaFormat: "PHOTO", sourceUrl: imageUrl }] }
    : {}),
}

console.log(`\n[3/4] POST ${LEGACY_V4_BASE}/${locationPath}/localPosts`)
console.log(JSON.stringify(postBody, null, 2))

const createRes = await fetch(`${LEGACY_V4_BASE}/${locationPath}/localPosts`, {
  method: "POST",
  headers: authHeaders,
  body: JSON.stringify(postBody),
  signal: AbortSignal.timeout(20_000),
})
const createBody = await createRes.text()

if (!createRes.ok) {
  console.error(`\n❌ create FAILED (HTTP ${createRes.status}):`)
  console.error(createBody)
  console.error(
    `\n  Nothing to clean up — no post was created.\n` +
      `  403 → token lacks post-write rights on this listing.\n` +
      `  400 on callToAction → the CTA shape is not accepted as sent.`
  )
  process.exit(1)
}

let created
try {
  created = JSON.parse(createBody)
} catch {
  fail(`create returned non-JSON: ${createBody}`)
}
console.log(`\n  ✓ CREATED — the post is now publicly visible.`)
console.log(JSON.stringify(created, null, 2))

// --- 4. delete it, no matter what happened above ----------------------------

// Media is ingested ASYNCHRONOUSLY (create returns state=PROCESSING), so an
// immediate delete proves only that Google ACCEPTED the sourceUrl — not that it
// could actually fetch it. Dwelling then re-reading is the only way to see the
// ingest outcome. Costs public exposure for the dwell, hence opt-in.
if (dwellSeconds > 0 && created.name) {
  console.log(`\n  ⏳ dwelling ${dwellSeconds}s to observe async ingest…`)
  await new Promise((resolve) => setTimeout(resolve, dwellSeconds * 1000))
  const reRead = await fetch(`${LEGACY_V4_BASE}/${created.name}`, {
    headers: authHeaders,
    signal: AbortSignal.timeout(15_000),
  })
  if (reRead.ok) {
    const after = await reRead.json()
    console.log(`  re-read state: ${after.state ?? "(none)"}`)
    console.log(
      `  re-read media: ${
        after.media
          ? JSON.stringify(after.media)
          : "(none — Google did not ingest the image)"
      }`
    )
    created.state = after.state ?? created.state
    created.media = after.media ?? created.media
  } else {
    console.log(`  re-read failed (HTTP ${reRead.status})`)
  }
}

// Nothing may sit between here and delete: every line runs while a real post is
// public, so the cleanup path stays straight-line (an earlier try/finally
// version was broken anyway — process.exit does not unwind into finally, so the
// delete would have been skipped on the failure branch).
if (!created.name) {
  console.error(
    `\n❌ create succeeded but returned no resource name — CANNOT auto-delete.\n` +
      `   Remove the post by hand in Business Profile Manager.`
  )
  process.exit(1)
}

console.log(`\n[4/4] DELETE ${LEGACY_V4_BASE}/${created.name}`)
const deleteRes = await fetch(`${LEGACY_V4_BASE}/${created.name}`, {
  method: "DELETE",
  headers: authHeaders,
  signal: AbortSignal.timeout(20_000),
})
const deleted = deleteRes.ok
if (deleted) {
  console.log(`  ✓ deleted (HTTP ${deleteRes.status})`)
} else {
  console.error(
    `  ❌ DELETE FAILED (HTTP ${deleteRes.status}): ${await deleteRes.text()}\n` +
      `     The post is STILL LIVE — remove it by hand in Business Profile Manager.`
  )
}

// What we actually learned, stated plainly.
const ctaEcho = created.callToAction
console.log(
  `\n${deleted ? "✅" : "⚠️"} WRITE PATH PROVEN` +
    `\n   state on create: ${created.state ?? "(none returned)"}` +
    `\n   callToAction accepted: ${
      ctaEcho ? `${ctaEcho.actionType} → ${ctaEcho.url}` : "NOT echoed back"
    }` +
    `\n   media accepted: ${created.media ? `${created.media.length} item(s)` : imageUrl ? "NOT echoed back" : "(not tested)"}` +
    `\n   searchUrl: ${created.searchUrl ?? "(none)"}` +
    `\n   cleanup: ${deleted ? "post deleted" : "MANUAL CLEANUP REQUIRED"}`
)
process.exit(deleted ? 0 : 1)
