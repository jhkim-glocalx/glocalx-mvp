import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { applyMigrations, openDatabase } from "./sqlite"

describe("SQLite GBP adoption-review migration", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
  })

  it("widens a pre-adoption gbp_access_requests table without losing operator progress", async () => {
    const tempPath = await mkdtemp(
      join(tmpdir(), "glocalx-adoption-migration-")
    )
    tempPaths.push(tempPath)
    const database = openDatabase(join(tempPath, "legacy.db"))
    database.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
        role TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE stores (
        id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, name TEXT NOT NULL,
        address TEXT NOT NULL, phone TEXT, category TEXT NOT NULL, hours TEXT,
        onboarding_status TEXT NOT NULL, created_at TEXT NOT NULL
      );
      INSERT INTO users VALUES ('owner', 'owner@example.com', 'Owner', 'OWNER', '2026-06-04T00:00:00.000Z');
      INSERT INTO stores VALUES ('store', 'owner', 'Store', 'Seoul', NULL, 'RESTAURANT', NULL, 'COMPLETED', '2026-06-04T00:00:00.000Z');
      -- A second store: gbp_access_requests_store_idx is unique per store, so the
      -- post-upgrade insert below needs one of its own.
      INSERT INTO stores VALUES ('store-2', 'owner', 'Store 2', 'Busan', NULL, 'RESTAURANT', NULL, 'COMPLETED', '2026-06-04T00:00:00.000Z');
      CREATE TABLE gbp_access_requests (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        gbp_location_ref TEXT,
        state TEXT NOT NULL CHECK (state IN (
          'not_requested', 'invited', 'pending', 'granted', 'revoked', 'blocked'
        )),
        note TEXT,
        requested_at TEXT NOT NULL,
        granted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO gbp_access_requests VALUES (
        'legacy-request', 'store', 'locations/legacy', 'pending', 'owner chasing',
        '2026-06-04T00:00:00.000Z', NULL,
        '2026-06-04T00:00:00.000Z', '2026-06-04T00:00:00.000Z'
      );
    `)

    applyMigrations(database)

    // The whole point of the rebuild: a state the old CHECK would have rejected.
    database
      .prepare(
        "INSERT INTO gbp_access_requests (id, store_id, gbp_location_ref, state, requested_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        "adoption-request",
        "store-2",
        "locations/adopted",
        "adoption_review",
        "2026-08-14T00:00:00.000Z",
        "2026-08-14T00:00:00.000Z",
        "2026-08-14T00:00:00.000Z"
      )

    expect(
      database
        .prepare("SELECT id, state, note FROM gbp_access_requests ORDER BY id")
        .all()
    ).toEqual([
      {
        id: "adoption-request",
        state: "adoption_review",
        note: null,
      },
      {
        id: "legacy-request",
        state: "pending",
        note: "owner chasing",
      },
    ])
    database.close()
  })
})
