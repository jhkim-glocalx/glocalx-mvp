import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { applyMigrations, openDatabase } from "./sqlite"

describe("SQLite social-channel migration", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
  })

  it("upgrades a GBP-only post_drafts table without losing rows", async () => {
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-social-migration-"))
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
      CREATE TABLE post_drafts (
        id TEXT PRIMARY KEY,
        store_id TEXT NOT NULL REFERENCES stores(id),
        owner_intent TEXT NOT NULL,
        target_channel TEXT NOT NULL CHECK (target_channel IN ('GBP')),
        status TEXT NOT NULL CHECK (status IN ('DRAFT', 'APPROVED', 'PUBLISHED', 'FAILED')),
        korean_copy TEXT NOT NULL,
        english_copy TEXT NOT NULL,
        revision_of_draft_id TEXT REFERENCES post_drafts(id),
        marketing_preview_json TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO post_drafts VALUES (
        'legacy-draft', 'store', 'legacy', 'GBP', 'DRAFT', '한국어', 'English', NULL, NULL,
        '2026-06-04T00:00:00.000Z'
      );
    `)

    applyMigrations(database)
    database
      .prepare(
        "INSERT INTO post_drafts (id, store_id, owner_intent, target_channel, status, korean_copy, english_copy, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        "instagram-draft",
        "store",
        "instagram",
        "INSTAGRAM",
        "DRAFT",
        "인스타그램",
        "Instagram",
        "2026-06-04T00:00:00.000Z"
      )

    expect(
      database
        .prepare("SELECT id, target_channel FROM post_drafts ORDER BY id")
        .all()
    ).toEqual([
      { id: "instagram-draft", target_channel: "INSTAGRAM" },
      { id: "legacy-draft", target_channel: "GBP" },
    ])
    database.close()
  })
})
