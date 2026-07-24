"use client"

import { useState } from "react"

import type { OrgCredentialSummary } from "@glocalx/db/support/org-credential-store"
import {
  isOrgCredentialExpired,
  orgCredentialProviderLabel,
  orgCredentialProviders,
  type OrgCredentialProvider,
} from "@glocalx/domain/org-credentials"

import { saveOrgCredential } from "./org-credentials-client"

type OrgCredentialsPanelProps = {
  readonly initialCredentials: readonly OrgCredentialSummary[]
}

type CredentialStatus = "linked" | "expired" | "missing"

function statusFor(
  summary: OrgCredentialSummary | undefined,
  now: Date
): CredentialStatus {
  if (summary === undefined) {
    return "missing"
  }
  const expiresAt =
    summary.expiresAt === null ? null : new Date(summary.expiresAt)
  return isOrgCredentialExpired(expiresAt, now) ? "expired" : "linked"
}

const statusLabels: Readonly<Record<CredentialStatus, string>> = {
  linked: "Linked",
  expired: "Expired",
  missing: "Not configured",
}

function formatTimestamp(value: string | null): string {
  return value === null ? "—" : new Date(value).toISOString().slice(0, 16)
}

export function OrgCredentialsPanel({
  initialCredentials,
}: OrgCredentialsPanelProps) {
  const [credentials, setCredentials] = useState(initialCredentials)
  const [provider, setProvider] = useState<OrgCredentialProvider>("google_org")
  const [token, setToken] = useState("")
  const [refreshToken, setRefreshToken] = useState("")
  const [expiresAt, setExpiresAt] = useState("")
  const [scopes, setScopes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(null)

    const result = await saveOrgCredential({
      provider,
      token: token.trim(),
      ...(refreshToken.trim() === ""
        ? {}
        : { refreshToken: refreshToken.trim() }),
      // datetime-local has no zone; the operator enters UTC per the field hint.
      ...(expiresAt === ""
        ? {}
        : { expiresAt: new Date(`${expiresAt}:00Z`).toISOString() }),
      ...(scopes.trim() === "" ? {} : { scopes: scopes.trim() }),
    })

    setSaving(false)
    if (result.kind === "error") {
      setError(result.message)
      return
    }

    // Clear the pasted secrets from component state the moment the save lands —
    // they have no further use here and nothing should re-render them.
    setToken("")
    setRefreshToken("")
    setCredentials(result.credentials)
    setSaved(`${orgCredentialProviderLabel(provider)} credential saved.`)
  }

  const now = new Date()

  return (
    <section
      className="ops-credentials"
      aria-label="Org publishing credentials"
    >
      <h2 className="ops-section-title">Organization publishing credentials</h2>

      <ul className="ops-credential-list">
        {orgCredentialProviders.map((candidate) => {
          const summary = credentials.find(
            (entry) => entry.provider === candidate
          )
          const status = statusFor(summary, now)
          return (
            <li
              key={candidate}
              className="ops-credential-row"
              data-testid={`credential-${candidate}`}
            >
              <span className="ops-credential-name">
                {orgCredentialProviderLabel(candidate)}
              </span>
              <span
                className={`ops-credential-status ops-credential-status--${status}`}
                data-testid={`credential-status-${candidate}`}
              >
                {statusLabels[status]}
              </span>
              <span className="ops-credential-meta">
                {summary === undefined
                  ? "No credential stored"
                  : `expires ${formatTimestamp(summary.expiresAt)} · updated ${formatTimestamp(summary.updatedAt)}${summary.hasRefreshToken ? " · refresh token stored" : ""}`}
              </span>
            </li>
          )
        })}
      </ul>

      <form className="ops-credential-form" onSubmit={handleSubmit}>
        <label className="ops-field">
          <span>Provider</span>
          <select
            value={provider}
            data-testid="credential-provider"
            onChange={(event) =>
              setProvider(event.target.value as OrgCredentialProvider)
            }
          >
            {orgCredentialProviders.map((candidate) => (
              <option key={candidate} value={candidate}>
                {orgCredentialProviderLabel(candidate)}
              </option>
            ))}
          </select>
        </label>

        <label className="ops-field">
          <span>Access token</span>
          <input
            type="password"
            value={token}
            required
            autoComplete="off"
            data-testid="credential-token"
            onChange={(event) => setToken(event.target.value)}
          />
        </label>

        <label className="ops-field">
          <span>Refresh token (optional)</span>
          <input
            type="password"
            value={refreshToken}
            autoComplete="off"
            data-testid="credential-refresh-token"
            onChange={(event) => setRefreshToken(event.target.value)}
          />
        </label>

        <label className="ops-field">
          <span>Expires at (UTC, optional)</span>
          <input
            type="datetime-local"
            value={expiresAt}
            data-testid="credential-expires-at"
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </label>

        <label className="ops-field">
          <span>Scopes (optional)</span>
          <input
            type="text"
            value={scopes}
            data-testid="credential-scopes"
            onChange={(event) => setScopes(event.target.value)}
          />
        </label>

        <button
          type="submit"
          className="ops-primary-button"
          disabled={saving || token.trim() === ""}
          data-testid="credential-save"
        >
          {saving ? "Saving…" : "Save credential"}
        </button>

        {error === null ? null : (
          <p className="ops-credential-error" data-testid="credential-error">
            {error}
          </p>
        )}
        {saved === null ? null : (
          <p className="ops-credential-saved" data-testid="credential-saved">
            {saved}
          </p>
        )}
      </form>
    </section>
  )
}
