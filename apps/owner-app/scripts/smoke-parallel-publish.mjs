// ⚠️ THIS SCRIPT WRITES TO TWO REAL CHANNELS. It publishes the same image and
// caption to a REAL Google Business Profile listing AND a REAL Instagram
// business account, then deletes only the GBP post.
//
// ‼️ THE INSTAGRAM POST CANNOT BE DELETED. The Instagram Graph API has no media
// delete endpoint, so the post stays publicly visible on the account until
// someone removes it by hand in the Instagram app. That is not a bug in this
// script — it is the platform. Do not run this against an account whose feed
// matters unless you are ready to delete the post yourself.
//
// WHY THIS EXISTS: campaign-publish.ts's two-channel run is covered by tests
// against stub adapters (publish-routes.test.ts "publishes an approved request
// to both channels"), so the orchestration — job reservation, replay, partial
// settlement — is proven. What no test can prove is that real Google and real
// Meta both accept the SAME asset in ONE run. This script proves exactly that
// and nothing more: it does not touch the database, the queue, or publish_jobs.
//
// It mirrors the two production adapters' request shapes on purpose:
//   GBP → packages/integrations/src/production.ts  createLocalPost
//   IG  → packages/integrations/src/instagram.ts   createPost (single-image path)
// If either adapter changes its host, version, or body, change it here too or
// this stops testing the thing it claims to test.
//
// SAFETY INTERLOCKS — the Google account also holds real client storefronts, so
// a mistyped id must not become a post on someone else's business:
//   1. SMOKE_GBP_LOCATION and SMOKE_IG_USER_ID must be passed in full.
//   2. The listing's real title must contain SMOKE_GBP_EXPECT_TITLE.
//   3. The IG account's real username must contain SMOKE_IG_EXPECT_USERNAME.
//   4. The listing must be verified (Voice of Merchant) — an unverified listing
//      is what the app's own publish gate refuses, so posting to one anyway
//      would prove nothing about the feature.
//   5. SMOKE_CONFIRM must be exactly "yes".
//
// Run from the repo root. Get the image URL from upload-smoke-image.mjs first,
// and sanity-check the IG token with validate-instagram-account.mjs. Secrets are
// read with `read -rs` so they never land in shell history or the terminal:
//
//   printf 'Google Client ID: '; read -rs GOOGLE_CLIENT_ID; echo
//   printf 'Google Client Secret: '; read -rs GOOGLE_CLIENT_SECRET; echo
//   printf 'Google Org Refresh Token: '; read -rs GOOGLE_ORG_REFRESH_TOKEN; echo
//   printf 'Instagram Access Token: '; read -rs INSTAGRAM_ACCESS_TOKEN; echo
//   GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
//   GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
//   GOOGLE_ORG_REFRESH_TOKEN="$GOOGLE_ORG_REFRESH_TOKEN" \
//   INSTAGRAM_ACCESS_TOKEN="$INSTAGRAM_ACCESS_TOKEN" \
//   SMOKE_GBP_LOCATION="accounts/108683171778167253197/locations/941049899414125596" \
//   SMOKE_GBP_EXPECT_TITLE="글로컬엑스" \
//   SMOKE_IG_USER_ID="17841400000000000" \
//   SMOKE_IG_EXPECT_USERNAME="glocalx" \
//   SMOKE_IMAGE_URL="https://<blob-host>/gbp-smoke/....jpg" \
//   SMOKE_CONFIRM=yes \
//   node apps/owner-app/scripts/smoke-parallel-publish.mjs
//
// Optional:
//   SMOKE_CAPTION          default "테스트용 게시물입니다"
//   SMOKE_CTA_URL          adds a LEARN_MORE button on GBP and the same labelled
//                          link as a caption suffix on IG, matching
//                          callToActionCaptionSuffix. Off by default so the
//                          caption stays exactly what was asked for.
//   SMOKE_SEQUENTIAL=true  publish GBP then IG one after the other, mirroring
//                          runCampaignPublish's actual for-loop instead of the
//                          harsher concurrent default.
//   SMOKE_DWELL_SECONDS    seconds to wait before re-reading the GBP post, to
//                          observe Google's ASYNC image ingest. Costs that many
//                          seconds of public exposure, so it is opt-in.
//   SMOKE_KEEP_GBP_POST=true  skip the GBP delete (leaves it public — manual
//                          cleanup required).

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
const BIZ_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"
const LEGACY_V4_BASE = "https://mybusiness.googleapis.com/v4"
const IG_GRAPH_VERSION = "v24.0"
const IG_GRAPH_BASE = `https://graph.instagram.com/${IG_GRAPH_VERSION}`

function fail(message) {
  console.error(`\nsmoke-parallel-publish: ${message}`)
  process.exit(1)
}

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const refreshToken = process.env.GOOGLE_ORG_REFRESH_TOKEN
const igToken = process.env.INSTAGRAM_ACCESS_TOKEN
const locationPath = process.env.SMOKE_GBP_LOCATION?.trim()
const expectTitle = process.env.SMOKE_GBP_EXPECT_TITLE?.trim()
const igUserId = process.env.SMOKE_IG_USER_ID?.trim()
const expectUsername = process.env.SMOKE_IG_EXPECT_USERNAME?.trim()
const imageUrl = process.env.SMOKE_IMAGE_URL?.trim()
const confirm = process.env.SMOKE_CONFIRM?.trim()
const caption = process.env.SMOKE_CAPTION ?? "테스트용 게시물입니다"
const ctaUrl = process.env.SMOKE_CTA_URL?.trim()
const sequential = process.env.SMOKE_SEQUENTIAL === "true"
const keepGbpPost = process.env.SMOKE_KEEP_GBP_POST === "true"
const dwellSeconds = Number(process.env.SMOKE_DWELL_SECONDS ?? "0")

if (!Number.isFinite(dwellSeconds) || dwellSeconds < 0 || dwellSeconds > 300) {
  fail("SMOKE_DWELL_SECONDS must be a number between 0 and 300")
}

const missing = [
  ["GOOGLE_CLIENT_ID", clientId],
  ["GOOGLE_CLIENT_SECRET", clientSecret],
  ["GOOGLE_ORG_REFRESH_TOKEN", refreshToken],
  ["INSTAGRAM_ACCESS_TOKEN", igToken],
  ["SMOKE_GBP_LOCATION", locationPath],
  ["SMOKE_GBP_EXPECT_TITLE", expectTitle],
  ["SMOKE_IG_USER_ID", igUserId],
  ["SMOKE_IG_EXPECT_USERNAME", expectUsername],
  ["SMOKE_IMAGE_URL", imageUrl],
]
  .filter(([, value]) => !value || value === "")
  .map(([name]) => name)
if (missing.length > 0) fail(`missing env vars: ${missing.join(", ")}`)

if (confirm !== "yes") {
  fail(
    `refusing to write without SMOKE_CONFIRM=yes.\n` +
      `  This publishes to two real channels. The Instagram post CANNOT be\n` +
      `  deleted by API and will stay public until removed by hand.`
  )
}
if (!/^accounts\/\d+\/locations\/\d+$/.test(locationPath)) {
  fail(
    `SMOKE_GBP_LOCATION must look like accounts/{id}/locations/{id}, got: ${locationPath}`
  )
}
if (!/^https:\/\//.test(imageUrl)) {
  fail(`SMOKE_IMAGE_URL must be an https URL, got: ${imageUrl}`)
}
// zsh's url-quote-magic escapes ? and & when a URL is PASTED at the prompt, and
// inside double quotes those backslashes survive into the value — producing a
// URL the blob host rejects (403/400) that still looks correct at a glance.
// Single quotes avoid it entirely.
if (imageUrl.includes("\\")) {
  fail(
    `SMOKE_IMAGE_URL contains backslashes, so it is not the URL you think:\n` +
      `  ${imageUrl}\n` +
      `  zsh escaped ? and & when you pasted it. Wrap the URL in SINGLE quotes\n` +
      `  ('...') instead of double quotes, or strip the backslashes.`
  )
}
// An @handle here would fail at Meta with "Object with ID ... does not exist",
// which reads like a bad token and sends you debugging the wrong thing.
if (!/^\d+$/.test(igUserId)) {
  fail(
    `SMOKE_IG_USER_ID must be the numeric Instagram user id, got "${igUserId}".\n` +
      `  That looks like an @handle. Get the numeric id from:\n` +
      `  node apps/owner-app/scripts/validate-instagram-account.mjs`
  )
}

console.log(
  `smoke-parallel-publish: ⚠️  TWO-CHANNEL WRITE TEST\n` +
    `  mode    : ${sequential ? "sequential (mirrors runCampaignPublish)" : "concurrent (harsher than the app)"}\n` +
    `  caption : ${JSON.stringify(caption)}\n` +
    `  button  : ${ctaUrl ? `LEARN_MORE → ${ctaUrl}` : "(none)"}`
)

// --- 1. the image must be publicly fetchable by BOTH platforms ---------------
// Both channels fetch the bytes themselves — Google copies them into its own
// CDN, Meta ingests them into the media container. An auth-walled or
// HTML-interstitial URL fails on both, and on Google it fails ASYNCHRONOUSLY,
// long after the create call returned 200. Checking here, unauthenticated,
// is the only cheap way to catch it before a post goes public.

console.log(`\n[1/5] Checking the image URL is publicly readable…`)
const imageHead = await fetch(imageUrl, {
  method: "GET",
  headers: { Range: "bytes=0-1023" },
  signal: AbortSignal.timeout(15_000),
}).catch((caught) =>
  fail(`image URL fetch failed: ${caught?.message ?? caught}`)
)
if (!imageHead.ok) {
  fail(
    `image URL returned HTTP ${imageHead.status}. Both Google and Meta fetch ` +
      `this URL anonymously, so it must be readable without credentials.`
  )
}
const imageType = imageHead.headers.get("content-type") ?? "(none)"
console.log(`  ✓ readable — content-type: ${imageType}`)
if (!/^image\/(jpeg|png)/.test(imageType)) {
  fail(
    `content-type is "${imageType}". Instagram accepts JPEG only; GBP accepts ` +
      `JPEG or PNG. Re-upload with the right content type.`
  )
}
if (!imageType.startsWith("image/jpeg")) {
  console.log(
    `  ⚠️  Instagram publishes JPEG only — a PNG will fail on the IG leg.`
  )
}

// --- 2. Google access token ---------------------------------------------------

console.log(`\n[2/5] Exchanging the org refresh token for an access token…`)
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
const { access_token: googleAccessToken } = await tokenRes.json()
if (!googleAccessToken) fail("token exchange returned no access_token")
console.log(`  ✓ access token obtained (not printed)`)

const googleHeaders = {
  Authorization: `Bearer ${googleAccessToken}`,
  "Content-Type": "application/json",
}

// --- 3. identity interlocks on both channels ---------------------------------
// Resolve both ids to human names and refuse unless they are the ones named.
// Read-only, so it is safe to run these together.

console.log(`\n[3/5] Verifying both targets are the intended accounts…`)
const locationId = locationPath.split("/").slice(-2).join("/") // locations/{id}

const [locationRes, igAccountRes] = await Promise.all([
  fetch(
    `${BIZ_INFO_BASE}/${locationId}?readMask=name,title,storefrontAddress,metadata`,
    {
      headers: googleHeaders,
      signal: AbortSignal.timeout(15_000),
    }
  ),
  fetch(
    `${IG_GRAPH_BASE}/${igUserId}?fields=user_id,username,account_type&access_token=${encodeURIComponent(igToken)}`,
    { method: "GET", signal: AbortSignal.timeout(15_000) }
  ),
])

if (!locationRes.ok) {
  fail(
    `could not read the GBP location (HTTP ${locationRes.status}): ${await locationRes.text()}`
  )
}
const location = await locationRes.json()
const title = location.title ?? ""
const address = location.storefrontAddress?.addressLines?.join(" ") ?? ""
console.log(`  GBP: "${title}"  ${address}`)
if (!title.includes(expectTitle)) {
  fail(
    `ABORTED — listing title "${title}" does not contain ` +
      `SMOKE_GBP_EXPECT_TITLE "${expectTitle}". Nothing was written.`
  )
}
if (location.metadata?.hasVoiceOfMerchant !== true) {
  fail(
    `ABORTED — the listing is NOT verified (no Voice of Merchant).\n` +
      `  Google rejects posts on unverified listings, and the app's own publish\n` +
      `  gate (evaluatePublishEligibility) refuses them too — so posting here\n` +
      `  would prove nothing. Finish verification first. Nothing was written.`
  )
}

if (!igAccountRes.ok) {
  fail(
    `could not read the Instagram account (HTTP ${igAccountRes.status}): ${await igAccountRes.text()}`
  )
}
const igAccount = await igAccountRes.json()
const username = igAccount.username ?? ""
console.log(
  `  IG : @${username}  (${igAccount.account_type ?? "unknown type"})`
)
if (!username.includes(expectUsername)) {
  fail(
    `ABORTED — Instagram username "@${username}" does not contain ` +
      `SMOKE_IG_EXPECT_USERNAME "${expectUsername}". Nothing was written.`
  )
}
console.log(`  ✓ both targets confirmed; GBP listing is verified`)

// --- 4. publish to both channels ---------------------------------------------

// GBP takes the button as a structured field; Instagram has no button, so
// campaign-publish.ts appends the same link to the caption instead. Mirroring
// that split here is what makes this a test of the feature rather than of two
// unrelated API calls.
const igCaption = ctaUrl ? `${caption}\n\n자세히 보기: ${ctaUrl}` : caption

async function publishToGbp() {
  const body = {
    languageCode: "ko",
    media: [{ mediaFormat: "PHOTO", sourceUrl: imageUrl }],
    summary: caption,
    topicType: "STANDARD",
    ...(ctaUrl
      ? { callToAction: { actionType: "LEARN_MORE", url: ctaUrl } }
      : {}),
  }
  const response = await fetch(`${LEGACY_V4_BASE}/${locationPath}/localPosts`, {
    method: "POST",
    headers: googleHeaders,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`GBP create failed (HTTP ${response.status}): ${text}`)
  }
  const created = JSON.parse(text)
  if (!created.name) {
    throw new Error(
      `GBP create returned no resource name — CANNOT auto-delete: ${text}`
    )
  }
  return created
}

async function igGraphPost(path, params, label) {
  const response = await fetch(`${IG_GRAPH_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: igToken, ...params }).toString(),
    signal: AbortSignal.timeout(20_000),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`IG ${label} failed (HTTP ${response.status}): ${text}`)
  }
  return JSON.parse(text)
}

async function publishToInstagram() {
  const container = await igGraphPost(
    `${igUserId}/media`,
    { caption: igCaption, image_url: imageUrl },
    "media container create"
  )
  if (!container.id) throw new Error("IG container create returned no id")

  // Diagnostic only — deliberately NOT a wait. instagram.ts publishes the
  // container immediately, so polling here would hide a race the production
  // adapter really has. Reading the status tells us whether that race is worth
  // fixing without changing what is being tested.
  const statusRes = await fetch(
    `${IG_GRAPH_BASE}/${container.id}?fields=status_code,status&access_token=${encodeURIComponent(igToken)}`,
    { method: "GET", signal: AbortSignal.timeout(15_000) }
  )
  const containerStatus = statusRes.ok
    ? ((await statusRes.json()).status_code ?? "(none)")
    : `(read failed HTTP ${statusRes.status})`

  const published = await igGraphPost(
    `${igUserId}/media_publish`,
    { creation_id: container.id },
    "media_publish"
  )
  if (!published.id) throw new Error("IG media_publish returned no id")

  const permalinkRes = await fetch(
    `${IG_GRAPH_BASE}/${published.id}?fields=permalink&access_token=${encodeURIComponent(igToken)}`,
    { method: "GET", signal: AbortSignal.timeout(15_000) }
  )
  const permalink = permalinkRes.ok
    ? ((await permalinkRes.json()).permalink ?? null)
    : null

  return { id: published.id, containerStatus, permalink }
}

console.log(
  `\n[4/5] Publishing to BOTH channels${sequential ? " in order" : " concurrently"}…`
)
console.log(`  GBP: POST ${LEGACY_V4_BASE}/${locationPath}/localPosts`)
console.log(`  IG : POST ${IG_GRAPH_BASE}/${igUserId}/media → /media_publish`)

let gbpOutcome
let igOutcome
if (sequential) {
  gbpOutcome = await publishToGbp().then(
    (value) => ({ status: "fulfilled", value }),
    (reason) => ({ status: "rejected", reason })
  )
  igOutcome = await publishToInstagram().then(
    (value) => ({ status: "fulfilled", value }),
    (reason) => ({ status: "rejected", reason })
  )
} else {
  // allSettled, never all: one channel failing must not abandon the other's
  // result — that asymmetry is exactly the "partially published" case the
  // feature is built around, and losing it would hide half the answer.
  ;[gbpOutcome, igOutcome] = await Promise.allSettled([
    publishToGbp(),
    publishToInstagram(),
  ])
}

const gbpPost = gbpOutcome.status === "fulfilled" ? gbpOutcome.value : null
const igPost = igOutcome.status === "fulfilled" ? igOutcome.value : null

console.log(
  `\n  GBP: ${gbpPost ? `✓ created ${gbpPost.name}` : `❌ ${gbpOutcome.reason?.message ?? gbpOutcome.reason}`}`
)
console.log(
  `  IG : ${igPost ? `✓ published ${igPost.id}` : `❌ ${igOutcome.reason?.message ?? igOutcome.reason}`}`
)

// --- 5. clean up what can be cleaned up --------------------------------------
// Nothing may sit between here and the GBP delete: every line runs while a real
// post is public. process.exit does not unwind into finally, so cleanup stays
// straight-line rather than relying on try/finally.

if (gbpPost && dwellSeconds > 0) {
  console.log(
    `\n  ⏳ dwelling ${dwellSeconds}s to observe Google's async ingest…`
  )
  await new Promise((resolve) => setTimeout(resolve, dwellSeconds * 1000))
  const reRead = await fetch(`${LEGACY_V4_BASE}/${gbpPost.name}`, {
    headers: googleHeaders,
    signal: AbortSignal.timeout(15_000),
  })
  if (reRead.ok) {
    const after = await reRead.json()
    console.log(`  GBP re-read state: ${after.state ?? "(none)"}`)
    console.log(
      `  GBP re-read media: ${
        after.media
          ? JSON.stringify(after.media)
          : "(none — Google did NOT ingest the image)"
      }`
    )
    gbpPost.state = after.state ?? gbpPost.state
    gbpPost.media = after.media ?? gbpPost.media
  } else {
    console.log(`  GBP re-read failed (HTTP ${reRead.status})`)
  }
}

let gbpDeleted = false
if (gbpPost && !keepGbpPost) {
  console.log(`\n[5/5] DELETE ${LEGACY_V4_BASE}/${gbpPost.name}`)
  const deleteRes = await fetch(`${LEGACY_V4_BASE}/${gbpPost.name}`, {
    method: "DELETE",
    headers: googleHeaders,
    signal: AbortSignal.timeout(20_000),
  })
  gbpDeleted = deleteRes.ok
  console.log(
    gbpDeleted
      ? `  ✓ GBP post deleted (HTTP ${deleteRes.status})`
      : `  ❌ GBP DELETE FAILED (HTTP ${deleteRes.status}): ${await deleteRes.text()}\n` +
          `     The post is STILL LIVE — remove it by hand in Business Profile Manager.`
  )
} else if (gbpPost) {
  console.log(
    `\n[5/5] Skipping GBP delete (SMOKE_KEEP_GBP_POST=true) — still live.`
  )
}

console.log(`\n${"=".repeat(70)}`)
console.log(
  gbpPost && igPost
    ? `✅ TWO-CHANNEL PUBLISH PROVEN — both channels accepted the same asset` +
        `${sequential ? " sequentially" : " concurrently"}.`
    : gbpPost || igPost
      ? `⚠️  PARTIAL — one channel published, one failed. This is the ` +
        `"partially_published" case; the failing channel's error is above.`
      : `❌ BOTH CHANNELS FAILED — errors above.`
)
console.log(`${"=".repeat(70)}`)
console.log(
  `\nGBP\n` +
    `  post      : ${gbpPost?.name ?? "(not created)"}\n` +
    `  state     : ${gbpPost?.state ?? "(none returned)"}\n` +
    `  button    : ${gbpPost?.callToAction ? `${gbpPost.callToAction.actionType} → ${gbpPost.callToAction.url}` : ctaUrl ? "NOT echoed back" : "(not tested)"}\n` +
    `  media     : ${gbpPost?.media ? `${gbpPost.media.length} item(s) accepted` : "NOT echoed back"}\n` +
    `  searchUrl : ${gbpPost?.searchUrl ?? "(none)"}\n` +
    `  cleanup   : ${gbpPost ? (gbpDeleted ? "deleted ✓" : "MANUAL CLEANUP REQUIRED") : "nothing to clean"}`
)
console.log(
  `\nINSTAGRAM\n` +
    `  media id       : ${igPost?.id ?? "(not published)"}\n` +
    `  container state: ${igPost?.containerStatus ?? "(n/a)"}   ← if this is not FINISHED, instagram.ts publishes too eagerly\n` +
    `  permalink      : ${igPost?.permalink ?? "(none)"}\n` +
    `  cleanup        : ${igPost ? "⚠️  MANUAL — no delete API. Remove it in the Instagram app." : "nothing to clean"}`
)
if (igPost) {
  console.log(
    `\n‼️  THE INSTAGRAM POST IS LIVE AND PUBLIC on @${username}.\n` +
      `   Open ${igPost.permalink ?? "the account feed"} and delete it when done.`
  )
}
console.log(
  `\nThe smoke image is still hosted at the URL you passed. Delete that blob too ` +
    `once Google's ingest is done (it copies the bytes, so deletion is safe after).`
)

process.exit(gbpPost && igPost && (gbpDeleted || keepGbpPost) ? 0 : 1)
