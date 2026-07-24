import type { OrgCredentialProvider } from "@glocalx/domain/org-credentials"
import { decryptToken, encryptToken } from "@glocalx/domain/token-encryption"
import { z } from "zod"

import type { Queryable } from "../types.ts"
import { nullableTimestampSchema, timestampSchema } from "./row-codecs.ts"

// Organization-wide publishing credentials. Read only by the admin app — the
// owner app has no route into this table, which is the point of inverting v1's
// owner-token publishing (architecture.md "Organization publishing
// credentials").
//
// Encryption happens HERE rather than in the caller so no route handler ever
// holds a plaintext token longer than the call that received it, and there is
// exactly one place where a plaintext value reaches SQL.

export type SaveOrgCredentialInput = {
  readonly id: string
  readonly provider: OrgCredentialProvider
  readonly token: string
  readonly refreshToken?: string | undefined
  readonly expiresAt?: Date | undefined
  readonly scopes?: string | undefined
  readonly now: Date
}

// What the settings panel renders. Deliberately carries no token material —
// only whether a refresh token exists, never its value.
export type OrgCredentialSummary = {
  readonly provider: OrgCredentialProvider
  readonly expiresAt: string | null
  readonly scopes: string | null
  readonly hasRefreshToken: boolean
  readonly updatedAt: string
}

export type OrgCredentialLookup =
  | {
      readonly kind: "found"
      readonly accessToken: string
      readonly expiresAt: Date | null
    }
  | { readonly kind: "missing" }
  | { readonly kind: "undecryptable" }

export interface OrgCredentialStore {
  // Upsert on provider: re-saving rotates the credential in place, so the
  // publish path never has to pick between two rows for one provider.
  saveOrgCredential(
    input: SaveOrgCredentialInput
  ): Promise<OrgCredentialSummary>
  listOrgCredentialSummaries(): Promise<readonly OrgCredentialSummary[]>
  readOrgCredential(
    provider: OrgCredentialProvider
  ): Promise<OrgCredentialLookup>
}

const summaryRowSchema = z.object({
  provider: z.string(),
  expiresAt: nullableTimestampSchema,
  scopes: z.string().nullable(),
  encryptedRefreshToken: z.string().nullable(),
  updatedAt: timestampSchema,
})

const credentialRowSchema = z.object({
  encryptedToken: z.string(),
  expiresAt: nullableTimestampSchema,
})

const summaryProjection = `
  provider,
  expires_at AS "expiresAt",
  scopes,
  encrypted_refresh_token AS "encryptedRefreshToken",
  updated_at AS "updatedAt"
`

function toSummary(row: unknown): OrgCredentialSummary {
  const parsed = summaryRowSchema.parse(row)
  return {
    provider: parsed.provider as OrgCredentialProvider,
    expiresAt: parsed.expiresAt,
    scopes: parsed.scopes,
    hasRefreshToken: parsed.encryptedRefreshToken !== null,
    updatedAt: parsed.updatedAt,
  }
}

export async function saveOrgCredential(
  queryable: Queryable,
  input: SaveOrgCredentialInput
): Promise<OrgCredentialSummary> {
  const encryptedToken = encryptToken(input.token)
  const encryptedRefreshToken =
    input.refreshToken === undefined ? null : encryptToken(input.refreshToken)
  const expiresAt = input.expiresAt?.toISOString() ?? null
  const timestamp = input.now.toISOString()

  await queryable.execute(
    `INSERT INTO org_credentials (
       id, provider, encrypted_token, encrypted_refresh_token,
       expires_at, scopes, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (provider) DO UPDATE SET
       encrypted_token = EXCLUDED.encrypted_token,
       encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
       expires_at = EXCLUDED.expires_at,
       scopes = EXCLUDED.scopes,
       updated_at = EXCLUDED.updated_at`,
    [
      input.id,
      input.provider,
      encryptedToken,
      encryptedRefreshToken,
      expiresAt,
      input.scopes ?? null,
      timestamp,
      timestamp,
    ]
  )

  const row = await queryable.queryOne(
    `SELECT ${summaryProjection} FROM org_credentials WHERE provider = ?`,
    [input.provider]
  )
  return toSummary(row)
}

export async function listOrgCredentialSummaries(
  queryable: Queryable
): Promise<readonly OrgCredentialSummary[]> {
  const rows = await queryable.query(
    `SELECT ${summaryProjection} FROM org_credentials ORDER BY provider ASC`
  )
  return rows.map(toSummary)
}

export async function readOrgCredential(
  queryable: Queryable,
  provider: OrgCredentialProvider
): Promise<OrgCredentialLookup> {
  const row = await queryable.queryOne(
    `SELECT encrypted_token AS "encryptedToken", expires_at AS "expiresAt"
       FROM org_credentials
      WHERE provider = ?`,
    [provider]
  )
  if (row === undefined) {
    return { kind: "missing" }
  }

  const parsed = credentialRowSchema.parse(row)
  const accessToken = decryptToken(parsed.encryptedToken)
  if (accessToken === undefined) {
    // decryptToken has already logged the cipher error. Surfacing this as its
    // own outcome keeps "key rotated" from masquerading as "never configured".
    return { kind: "undecryptable" }
  }

  return {
    kind: "found",
    accessToken,
    expiresAt: parsed.expiresAt === null ? null : new Date(parsed.expiresAt),
  }
}

export function createDatabaseOrgCredentialStore(
  queryable: Queryable
): OrgCredentialStore {
  return {
    saveOrgCredential(input) {
      return saveOrgCredential(queryable, input)
    },
    listOrgCredentialSummaries() {
      return listOrgCredentialSummaries(queryable)
    },
    readOrgCredential(provider) {
      return readOrgCredential(queryable, provider)
    },
  }
}
