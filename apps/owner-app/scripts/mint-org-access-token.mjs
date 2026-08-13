// Mints a fresh Google ORG access token for the admin app's Settings →
// "Organization publishing credentials" form, and puts it on the CLIPBOARD
// instead of printing it.
//
// WHY THIS EXISTS: the org credential the campaign publish path uses is a
// manually-saved ACCESS token (org-credential-store.ts saveOrgCredential), and
// nothing refreshes it — that is deliberate, not an oversight
// ("detect-and-fail, never a silent refresh loop", org-credentials.ts). Google
// access tokens live ~1 hour, so the operator has to mint one shortly before a
// publish run. This does the same refresh→access exchange the app's
// google-org-auth.ts does, then hands it over for pasting.
//
// CLIPBOARD, NOT STDOUT: every other script here refuses to print secrets, and
// this one keeps that rule. The token goes to the clipboard (pbcopy on macOS,
// wl-copy/xclip on Linux) and only its metadata — expiry, scope, length — is
// printed. That also keeps it out of terminal scrollback. Pass PRINT_TOKEN=yes
// to fall back to stdout if no clipboard tool is available.
//
// Run from the repo root. The three inputs are the same ones the GBP smoke and
// probe scripts take, so if they are already exported in this shell it needs no
// arguments at all:
//
//   printf 'Client ID: '; read -rs GOOGLE_CLIENT_ID; echo
//   printf 'Client Secret: '; read -rs GOOGLE_CLIENT_SECRET; echo
//   printf 'Org Refresh Token: '; read -rs GOOGLE_ORG_REFRESH_TOKEN; echo
//   export GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_ORG_REFRESH_TOKEN
//   node apps/owner-app/scripts/mint-org-access-token.mjs

import { spawn } from "node:child_process"

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"

function fail(message) {
  console.error(`\nmint-org-access-token: ${message}`)
  process.exit(1)
}

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET
const refreshToken = process.env.GOOGLE_ORG_REFRESH_TOKEN
const printToken = process.env.PRINT_TOKEN === "yes"

const missing = [
  ["GOOGLE_CLIENT_ID", clientId],
  ["GOOGLE_CLIENT_SECRET", clientSecret],
  ["GOOGLE_ORG_REFRESH_TOKEN", refreshToken],
]
  .filter(([, value]) => !value || value.trim() === "")
  .map(([name]) => name)
if (missing.length > 0) fail(`missing env vars: ${missing.join(", ")}`)
// The placeholder `vercel env pull` writes for Sensitive vars reaches Google as
// a literal string and comes back as invalid_client, which reads like a revoked
// credential. Name the real cause here instead.
if ([clientId, clientSecret, refreshToken].includes("[SENSITIVE]")) {
  fail(
    `one of the inputs is the literal "[SENSITIVE]" placeholder that\n` +
      `  vercel env pull writes for Sensitive vars. Type the real values instead.`
  )
}

console.log(`Exchanging the org refresh token for an access token…`)
const response = await fetch(TOKEN_ENDPOINT, {
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
const body = await response.text()
if (!response.ok) {
  console.error(`\n❌ token exchange failed (HTTP ${response.status}):`)
  console.error(body)
  console.error(
    `\n  invalid_client => client id/secret wrong for this refresh token.\n` +
      `  invalid_grant  => the refresh token is revoked or expired.`
  )
  process.exit(1)
}

let payload
try {
  payload = JSON.parse(body)
} catch {
  fail(`token endpoint returned non-JSON: ${body.slice(0, 200)}`)
}
const accessToken = payload.access_token
if (!accessToken) fail("token exchange returned no access_token")

const expiresInSeconds = Number(payload.expires_in ?? 3600)
const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)

// pbcopy/wl-copy/xclip in order; first one that exists wins.
async function copyToClipboard(text) {
  const candidates =
    process.platform === "darwin"
      ? [["pbcopy", []]]
      : [
          ["wl-copy", []],
          ["xclip", ["-selection", "clipboard"]],
        ]
  for (const [command, args] of candidates) {
    const copied = await new Promise((resolve) => {
      const child = spawn(command, args, {
        stdio: ["pipe", "ignore", "ignore"],
      })
      child.on("error", () => resolve(false))
      child.on("close", (code) => resolve(code === 0))
      child.stdin.end(text)
    })
    if (copied) return command
  }
  return undefined
}

const copiedWith = printToken ? undefined : await copyToClipboard(accessToken)

console.log(`\n✓ access token minted`)
console.log(`  length      : ${accessToken.length} chars`)
console.log(`  granted scope: ${payload.scope ?? "(none returned)"}`)
console.log(`  expires in  : ${Math.round(expiresInSeconds / 60)} minutes`)
console.log(
  `  expires at  : ${expiresAt.toISOString()}   ← paste into "Expires at (UTC, optional)"`
)

if (copiedWith !== undefined) {
  console.log(
    `\n📋 TOKEN COPIED TO CLIPBOARD (via ${copiedWith}) — not printed.`
  )
} else if (printToken) {
  console.log(
    `\nPRINT_TOKEN=yes — token below. Clear your scrollback afterwards.\n`
  )
  console.log(accessToken)
} else {
  fail(
    `could not reach a clipboard tool (tried ${process.platform === "darwin" ? "pbcopy" : "wl-copy, xclip"}).\n` +
      `  Re-run with PRINT_TOKEN=yes to print it to stdout instead.`
  )
}

console.log(
  `\nNext: admin Settings → Organization publishing credentials\n` +
    `  Provider   : Google organization\n` +
    `  Access token: paste (⌘V)\n` +
    `  Refresh token: leave EMPTY — the app never refreshes it, and storing one\n` +
    `                 would imply it does.\n` +
    `  Expires at : ${expiresAt.toISOString()}\n` +
    `  Scopes     : ${payload.scope ?? ""}\n` +
    `\nFilling "Expires at" matters: leaving it blank makes isOrgCredentialExpired\n` +
    `return false forever, so an expired token fails inside the Google call\n` +
    `instead of as a clean "re-link it in Settings" message.`
)
