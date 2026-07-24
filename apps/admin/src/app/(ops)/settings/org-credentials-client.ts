import type { OrgCredentialSummary } from "@glocalx/db/support/org-credential-store"
import type { SaveOrgCredentialRequest } from "@glocalx/domain/org-credentials"

// Fetch helpers for the org-credentials panel, kept out of the component so the
// request/response shapes live in one place (mirrors queue-client.ts).

const credentialsUrl = "/api/settings/org-credentials"

export type SaveCredentialResult =
  | {
      readonly kind: "ok"
      readonly credentials: readonly OrgCredentialSummary[]
    }
  | { readonly kind: "error"; readonly message: string }

function readCredentials(payload: unknown): readonly OrgCredentialSummary[] {
  return typeof payload === "object" &&
    payload !== null &&
    "credentials" in payload
    ? (payload as { credentials: readonly OrgCredentialSummary[] }).credentials
    : []
}

export async function saveOrgCredential(
  body: SaveOrgCredentialRequest
): Promise<SaveCredentialResult> {
  let response: Response
  try {
    response = await fetch(credentialsUrl, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
  } catch {
    return { kind: "error", message: "The request could not be sent." }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return {
      kind: "error",
      message: "The server returned an unreadable response.",
    }
  }

  if (response.ok) {
    return { kind: "ok", credentials: readCredentials(payload) }
  }

  const message =
    typeof payload === "object" && payload !== null && "message" in payload
      ? String((payload as { message: unknown }).message)
      : "The credential could not be saved."
  return { kind: "error", message }
}
