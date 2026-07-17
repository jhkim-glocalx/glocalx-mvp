import { createHmac, timingSafeEqual } from "node:crypto"

import type { AdapterEnvironment } from "@/integrations/contracts"

function mediaSigningKey(env: AdapterEnvironment): string | undefined {
  return (
    env["POST_MEDIA_SIGNING_KEY"]?.trim() ||
    env["TOKEN_ENCRYPTION_KEY"]?.trim() ||
    undefined
  )
}

function publicAppUrl(env: AdapterEnvironment): string | undefined {
  const configured =
    env["PUBLIC_APP_URL"]?.trim() || env["NEXT_PUBLIC_APP_URL"]?.trim()
  if (configured) {
    return configured
  }
  const vercelUrl = env["VERCEL_URL"]?.trim()
  return vercelUrl ? `https://${vercelUrl}` : undefined
}

function signatureFor(
  draftId: string,
  assetId: string,
  expires: string,
  key: string
): string {
  return createHmac("sha256", key)
    .update(`${draftId}:${assetId}:${expires}`)
    .digest("base64url")
}

export function createPostMediaUrl(
  draftId: string,
  assetId: string,
  env: AdapterEnvironment = process.env
): string | undefined {
  const baseUrl = publicAppUrl(env)
  const key = mediaSigningKey(env)
  if (baseUrl === undefined || key === undefined) {
    return undefined
  }
  const expires = String(Math.floor(Date.now() / 1000) + 60 * 60)
  const url = new URL(
    `/api/posts/${encodeURIComponent(draftId)}/media/${encodeURIComponent(assetId)}`,
    baseUrl
  )
  url.searchParams.set("expires", expires)
  url.searchParams.set(
    "signature",
    signatureFor(draftId, assetId, expires, key)
  )
  return url.toString()
}

export function isValidPostMediaSignature(
  draftId: string,
  assetId: string,
  signature: string,
  expires: string,
  env: AdapterEnvironment = process.env
): boolean {
  const key = mediaSigningKey(env)
  const expiresAt = Number(expires)
  if (
    key === undefined ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt < Math.floor(Date.now() / 1000)
  ) {
    return false
  }
  const expected = Buffer.from(signatureFor(draftId, assetId, expires, key))
  const received = Buffer.from(signature)
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  )
}
