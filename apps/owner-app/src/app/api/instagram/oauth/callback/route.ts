import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  encryptToken,
  missingTokenEncryptionEnvVars,
} from "@/auth/token-encryption"
import {
  compareInstagramHandles,
  normalizeInstagramHandle,
} from "@/instagram/account-handle"
import {
  expiredInstagramOAuthStateCookieOptions,
  getInstagramOAuthRedirectUri,
  instagramConnectRedirectLocation,
  instagramOAuthStateCookieName,
  isValidInstagramOAuthCallback,
  parseInstagramOAuthState,
  type InstagramConnectResult,
} from "@/instagram/oauth-link"
import { readDatabaseSession, withQueryableRouteDatabase } from "@/server/http"

function redirectClearingState(location: string): NextResponse {
  const response = new NextResponse(null, {
    headers: { Location: location },
    status: 303,
  })
  // Every exit expires the one-time state so it cannot be replayed.
  response.cookies.set(
    instagramOAuthStateCookieName,
    "",
    expiredInstagramOAuthStateCookieOptions
  )
  return response
}

function redirectWithResult(result: InstagramConnectResult): NextResponse {
  return redirectClearingState(instagramConnectRedirectLocation(result))
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? ""
  const state = request.nextUrl.searchParams.get("state") ?? ""
  const binding = parseInstagramOAuthState(
    request.cookies.get(instagramOAuthStateCookieName)?.value
  )

  return withQueryableRouteDatabase(
    async ({ adapters, sessionStore, storeChannelLinkStore }) => {
      const session = await readDatabaseSession(request, sessionStore)
      if (session === undefined) {
        // No authenticated owner: cannot own a channel link. Back to entry.
        return redirectClearingState("/")
      }

      // State + ownership gate: rejects a forged/replayed callback and confirms
      // the bound store still matches the owner's session before any write.
      if (
        !isValidInstagramOAuthCallback({
          code,
          state,
          binding,
          sessionStoreId: session.storeId,
        })
      ) {
        return redirectWithResult("error")
      }

      // A valid state is not enough if the encryption key drifted after start —
      // without it the token cannot be stored, so block before exchanging.
      if (missingTokenEncryptionEnvVars(process.env).length > 0) {
        return redirectWithResult("error")
      }

      const result = await adapters.instagramOAuth.connect({
        code,
        // Must byte-for-byte match the start route's redirect_uri.
        redirectUri: getInstagramOAuthRedirectUri(request, process.env),
      })

      // Missing production credentials surface as a controlled result, never a
      // raw error or secret in logs.
      if (result.kind === "blocked_by_credentials") {
        return redirectWithResult("error")
      }

      const outcome = result.value
      if (outcome.kind === "needs_professional_account") {
        // Authenticated but a personal account — guide the owner to convert;
        // write no link so a later reconnect starts clean.
        return redirectWithResult("needs_professional_account")
      }
      if (outcome.kind === "upstream_error") {
        return redirectWithResult("error")
      }

      // Did the owner land on the account they named on the way in? A mismatch
      // does not block the link — it is surfaced so the owner can confirm or
      // reconnect, and persisted so the answer survives the redirect.
      const requestedHandle = normalizeInstagramHandle(
        binding?.requestedHandle ?? ""
      )
      const linkedUsername = normalizeInstagramHandle(outcome.account.username)
      const handleMatch = compareInstagramHandles(
        requestedHandle,
        linkedUsername
      )

      // Ownership already confirmed, so the link is always written to the
      // session's own store; the token is encrypted before it reaches the store.
      await storeChannelLinkStore.upsertLink({
        storeId: session.storeId,
        channel: "instagram",
        externalAccountRef: outcome.account.accountRef,
        encryptedToken: encryptToken(outcome.account.accessToken),
        status: "linked",
        requestedAccountHandle: requestedHandle === "" ? null : requestedHandle,
        linkedAccountUsername: linkedUsername === "" ? null : linkedUsername,
        now: new Date(),
      })
      return redirectWithResult(
        handleMatch === "mismatch" ? "connected_other_account" : "connected"
      )
    }
  )
}
