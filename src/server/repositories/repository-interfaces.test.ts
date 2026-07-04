import { describe, expect, it } from "vitest"

import { repositoryContractNames } from "@/server/repositories"
import type {
  AuditLogStore,
  ConversationStore,
  GbpStore,
  JobStore,
  PostStore,
  SessionStore,
  StoreProfileRepository,
} from "@/server/repositories"

type RepositoryContractName = keyof {
  readonly "audit-log-store": AuditLogStore
  readonly "conversation-store": ConversationStore
  readonly "gbp-store": GbpStore
  readonly "job-store": JobStore
  readonly "post-store": PostStore
  readonly "session-store": SessionStore
  readonly "store-profile": StoreProfileRepository
}

const requiredRepositoryContracts = [
  "session-store",
  "store-profile",
  "conversation-store",
  "gbp-store",
  "post-store",
  "job-store",
  "audit-log-store",
] as const satisfies readonly RepositoryContractName[]

describe("repository interface exports", () => {
  it("names every v1 SQLite repository boundary before the Postgres port", () => {
    expect(requiredRepositoryContracts).toEqual(repositoryContractNames)
  })
})
