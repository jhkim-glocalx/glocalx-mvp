// Uploads a local image to Vercel Blob and prints a URL that Google's post
// fetcher can actually read. Exists because GBP local posts accept media ONLY
// as `sourceUrl` — Google fetches the bytes itself, so the image must live at a
// public HTTPS URL before a post can reference it. Share links from Drive /
// Notion / Slack do NOT work: they serve an HTML interstitial or demand auth,
// and Google gets no image bytes.
//
// Two modes, matching the two things worth testing:
//   BLOB_ACCESS=public  (default) — permanent public URL. Proves the media
//                        field works at all.
//   BLOB_ACCESS=private          — uploads privately then mints a presigned GET
//                        URL, mirroring what campaign-publish.ts actually hands
//                        Google in production (1h TTL, access:"private").
//
// Run from the repo root:
//
//   printf 'Blob token: '; read -rs BLOB_READ_WRITE_TOKEN; echo
//   BLOB_READ_WRITE_TOKEN="$BLOB_READ_WRITE_TOKEN" \
//   BLOB_IMAGE_FILE=~/Desktop/logo.png \
//   node apps/owner-app/scripts/upload-smoke-image.mjs
//
// Optional: BLOB_ACCESS (public|private), BLOB_TTL_SECONDS (private only,
// default 3600 to match publishSignedUrlTtlSeconds).

import { readFile } from "node:fs/promises"
import { basename, extname } from "node:path"

import { put } from "@vercel/blob"

function fail(message) {
  console.error(`\nupload-smoke-image: ${message}`)
  process.exit(1)
}

const token = process.env.BLOB_READ_WRITE_TOKEN
const filePath = process.env.BLOB_IMAGE_FILE
const access = process.env.BLOB_ACCESS?.trim() ?? "public"
const ttlSeconds = Number(process.env.BLOB_TTL_SECONDS ?? "3600")

if (!token) fail("missing BLOB_READ_WRITE_TOKEN")
if (!filePath) fail("missing BLOB_IMAGE_FILE (path to a local image)")
if (access !== "public" && access !== "private") {
  fail(`BLOB_ACCESS must be "public" or "private", got "${access}"`)
}

const contentTypes = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
}
const extension = extname(filePath).toLowerCase()
const contentType = contentTypes[extension]
if (!contentType) {
  fail(
    `unsupported extension "${extension}". GBP post media takes PNG or JPEG ` +
      `(webp is accepted by Blob but not reliably by GBP).`
  )
}

let bytes
try {
  bytes = await readFile(filePath)
} catch (caught) {
  fail(`could not read ${filePath}: ${caught?.message ?? caught}`)
}

// GBP rejects post photos under 250x250 or 10KB. Catching that here beats
// burning a real (publicly visible) post to discover it. PNG carries width and
// height in the IHDR chunk at a fixed offset; JPEG would need SOF parsing, so
// it is left to Google.
if (extension === ".png" && bytes.length > 24) {
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  console.log(`  image: ${width}x${height}, ${bytes.length} bytes`)
  if (width < 250 || height < 250) {
    fail(`PNG is ${width}x${height} — GBP requires at least 250x250.`)
  }
} else {
  console.log(`  image: ${bytes.length} bytes`)
}
if (bytes.length < 10 * 1024) {
  fail(`file is ${bytes.length} bytes — GBP requires at least 10KB.`)
}

const pathname = `gbp-smoke/${Date.now()}-${basename(filePath)}`
console.log(`\nUploading to Vercel Blob (access=${access})…`)

let blob
try {
  blob = await put(pathname, bytes, { access, contentType, token })
} catch (caught) {
  fail(`upload failed: ${caught?.message ?? caught}`)
}

if (access === "public") {
  console.log(`\n✅ PUBLIC URL (permanent until deleted):\n${blob.url}`)
  console.log(
    `\nPass it to the post smoke as GBP_SMOKE_IMAGE_URL.\n` +
      `Remember it stays publicly readable — delete it when the test is done.`
  )
  process.exit(0)
}

// Private mode: mirror production by presigning a GET, so the smoke exercises
// the exact URL shape campaign-publish.ts hands the channel.
const { presignUrl, issueSignedToken } = await import("@vercel/blob")
const signedToken = await issueSignedToken({
  token,
  pathname: blob.pathname,
  operations: ["get"],
  validUntil: Date.now() + ttlSeconds * 1000,
})
const { presignedUrl } = await presignUrl(signedToken, {
  operation: "get",
  pathname: blob.pathname,
  access: "private",
})

console.log(`\n✅ PRESIGNED URL (expires in ${ttlSeconds}s):\n${presignedUrl}`)
console.log(
  `\nThis is the production shape. If a post using it renders its photo, the\n` +
    `private+TTL media path is proven; if the photo is missing, the TTL races\n` +
    `Google's async ingest and campaign-publish.ts needs a longer-lived URL.`
)
