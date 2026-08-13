// Answers why `POST /{ig-user-id}/media` returned 400 during a real campaign
// publish, by asking Meta directly and printing its ANSWER — the thing
// instagram.ts currently throws away ("Instagram publishing failed with 400.").
//
// It takes the image URL as input rather than minting one, so it needs no blob
// credentials. Feed it the exact `signedUrl` the admin API reports for the
// campaign's processed asset — that is the same URL the publish path handed
// Instagram:
//
//   fetch('/api/queue/requests/<id>').then(r=>r.json())
//     .then(j=>j.request.assets[0].signedUrl)
//
// WHAT IT ISOLATES: a campaign publish uses the store's OAuth token from
// store_channel_links, while the two-channel smoke used the dev-console token in
// INSTAGRAM_ACCESS_TOKEN. Those are different credentials. Running this with the
// dev-console token separates the two candidate causes:
//   succeeds -> the URL and the image are fine; the OAuth token is the problem
//   fails    -> Meta names the real reason, whatever it is
//
// Creates NOTHING public: it stops at the container. An unpublished container
// expires on its own (~24h) and never appears on the account. media_publish is
// deliberately never called.
//
// Run from the repo root:
//
//   printf 'Instagram Access Token: '; read -rs INSTAGRAM_ACCESS_TOKEN; echo
//   INSTAGRAM_ACCESS_TOKEN="$INSTAGRAM_ACCESS_TOKEN" \
//   INSTAGRAM_USER_ID='17841441013510719' \
//   IMAGE_URL='<the signedUrl from the admin API>' \
//   node apps/owner-app/scripts/diagnose-instagram-media-url.mjs
//
// Optional: CAPTION (default "테스트용 게시물입니다"), SKIP_META=true to only
// check that the URL is readable without credentials.

const IG_GRAPH_BASE = "https://graph.instagram.com/v24.0"

function fail(message) {
  console.error(`\ndiagnose-instagram-media-url: ${message}`)
  process.exit(1)
}

const igToken = process.env.INSTAGRAM_ACCESS_TOKEN
const igUserId = process.env.INSTAGRAM_USER_ID?.trim()
const imageUrl = process.env.IMAGE_URL?.trim()
const caption = process.env.CAPTION ?? "테스트용 게시물입니다"
const skipMeta = process.env.SKIP_META === "true"

if (!imageUrl) fail("missing IMAGE_URL")
if (!/^https:\/\//.test(imageUrl)) {
  fail(`IMAGE_URL must be an https URL, got: ${imageUrl}`)
}
// zsh's url-quote-magic escapes ? and & on paste, and inside DOUBLE quotes the
// backslashes survive — producing a URL the blob host rejects while still
// looking right. Single-quote it.
if (imageUrl.includes("\\")) {
  fail(
    `IMAGE_URL contains backslashes, so it is not the URL you think:\n` +
      `  ${imageUrl}\n` +
      `  zsh escaped ? and & when you pasted it. Use SINGLE quotes ('...').`
  )
}
if (!skipMeta) {
  const missing = [
    ["INSTAGRAM_ACCESS_TOKEN", igToken],
    ["INSTAGRAM_USER_ID", igUserId],
  ]
    .filter(([, value]) => !value || value.trim() === "")
    .map(([name]) => name)
  if (missing.length > 0) {
    fail(`missing env vars: ${missing.join(", ")} (or pass SKIP_META=true)`)
  }
  if (!/^\d+$/.test(igUserId)) {
    fail(`INSTAGRAM_USER_ID must be the numeric id, got "${igUserId}"`)
  }
}

const shown = new URL(imageUrl)
console.log(`image URL shape (signature not printed):`)
console.log(`  host  : ${shown.host}`)
console.log(`  path  : ${shown.pathname}`)
console.log(
  `  params: ${[...shown.searchParams.keys()].join(", ") || "(none)"}`
)

// --- 1. can an anonymous client read it? That is all Meta is ----------------
// Meta fetches image_url synchronously during container create, with no
// credentials of ours. If this step fails, nothing else matters.

console.log(`\n[1/2] Fetching it ANONYMOUSLY (exactly what Meta does)…`)
const anonymous = await fetch(imageUrl, {
  method: "GET",
  headers: { Range: "bytes=0-1023" },
  signal: AbortSignal.timeout(15_000),
}).catch((caught) =>
  fail(`anonymous fetch threw: ${caught?.message ?? caught}`)
)
console.log(`  status      : ${anonymous.status}`)
console.log(
  `  content-type: ${anonymous.headers.get("content-type") ?? "(none)"}`
)
if (!anonymous.ok) {
  const body = await anonymous.text()
  console.error(
    `\n❌ NOT ANONYMOUSLY READABLE — this alone explains Meta's 400, and it would\n` +
      `   also break Google's async image ingest (a post with no photo).\n` +
      `   Body: ${body.slice(0, 300)}`
  )
  process.exit(1)
}
console.log(`  ✓ readable without credentials`)

if (skipMeta) {
  console.log(`\nSKIP_META=true — stopping. The URL itself is fine.`)
  process.exit(0)
}

// --- 2. the real question ---------------------------------------------------

console.log(
  `\n[2/2] POST ${IG_GRAPH_BASE}/${igUserId}/media   (container only, NOT published)`
)
const response = await fetch(`${IG_GRAPH_BASE}/${igUserId}/media`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    access_token: igToken,
    caption,
    image_url: imageUrl,
  }).toString(),
  signal: AbortSignal.timeout(30_000),
})
const text = await response.text()

console.log(`\n${"=".repeat(70)}`)
if (response.ok) {
  console.log(
    `✅ META ACCEPTED IT (HTTP ${response.status}) with THIS token.\n` +
      `   ${text.slice(0, 200)}\n\n` +
      `   So the URL and the image are fine. The campaign publish used the\n` +
      `   store's OAuth token from store_channel_links instead — that is the\n` +
      `   difference, so the problem is that token or its granted permissions.\n` +
      `   The container was left unpublished and expires by itself.`
  )
} else {
  console.log(`❌ META REJECTED IT (HTTP ${response.status}). Its own words:\n`)
  console.log(text.slice(0, 1200))
  console.log(
    `\n   Reading it:\n` +
      `     "Media download failed" / not accessible -> Meta cannot read the URL\n` +
      `     aspect ratio / size complaints           -> the image itself\n` +
      `     permission or scope errors               -> this token`
  )
}
console.log(`${"=".repeat(70)}`)
process.exit(response.ok ? 0 : 1)
