import { randomUUID } from "node:crypto"

import type { NextRequest } from "next/server"

import { parseAdminJson, withAdminRoute } from "@/server/route-database"
import { saveOrgCredentialRequestSchema } from "@glocalx/domain/org-credentials"
import { missingTokenEncryptionEnvVars } from "@glocalx/domain/token-encryption"

// Organization publishing credentials. Admin-only by construction — the owner
// app has no route into this table at all (architecture.md "Organization
// publishing credentials").
//
// Nothing here ever returns token material: the response is the same summary
// list the panel renders on load, so a successful save cannot echo the value
// back into a browser, a log, or a screenshot.

function encryptionUnavailableResponse(missing: readonly string[]): Response {
  return Response.json(
    {
      status: "ENCRYPTION_UNAVAILABLE",
      // The env var *names*, never their values — the established shape for
      // blocked_by_credentials elsewhere in the codebase.
      message: `Token encryption is not configured (${missing.join(", ")}). Set it before saving a credential.`,
    },
    { status: 503 }
  )
}

export async function GET(request: NextRequest) {
  return withAdminRoute(request, async (context) => {
    return Response.json({
      credentials:
        await context.orgCredentialStore.listOrgCredentialSummaries(),
    })
  })
}

export async function POST(request: NextRequest) {
  return withAdminRoute(
    request,
    async (context) => {
      const parsed = await parseAdminJson(
        request,
        saveOrgCredentialRequestSchema
      )
      if (parsed.kind === "response") {
        return parsed.response
      }

      // Checked before the write rather than caught after: saveOrgCredential
      // throws on a missing key, and a 500 would leave the operator guessing at
      // a configuration problem we can name precisely.
      const missing = missingTokenEncryptionEnvVars()
      if (missing.length > 0) {
        return encryptionUnavailableResponse(missing)
      }

      const { provider, token, refreshToken, expiresAt, scopes } = parsed.value
      await context.orgCredentialStore.saveOrgCredential({
        id: randomUUID(),
        provider,
        token,
        refreshToken,
        expiresAt: expiresAt === undefined ? undefined : new Date(expiresAt),
        scopes,
        now: new Date(),
      })

      await context.auditLogStore.record({
        action: "org_credential_saved",
        adminUserId: context.adminUserId,
        // Which provider was rotated and whether it carries an expiry — never
        // the token, the refresh token, or the scopes' contents.
        detail: {
          provider,
          hasExpiry: String(expiresAt !== undefined),
        },
      })

      return Response.json({
        credentials:
          await context.orgCredentialStore.listOrgCredentialSummaries(),
      })
    },
    { requireSameOrigin: true }
  )
}
