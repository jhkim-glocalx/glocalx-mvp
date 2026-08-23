import { randomUUID } from "node:crypto"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createAdminAuthStore } from "@/server/admin-auth-store"
import { createSqliteQueryable } from "@glocalx/db/sqlite-client"
import {
  applyMigrations,
  openDatabase,
  resetDatabaseFile,
  seedDemoData,
} from "@glocalx/db/sqlite"
import { createDatabaseGbpAccessStore } from "@glocalx/db/support/gbp-access-store"
import type { GbpAccessState } from "@glocalx/domain/gbp-access"

import { GET as listStores } from "./access-requests/route"
import { POST as editNote } from "./access-requests/[requestId]/note/route"
import { POST as transition } from "./access-requests/[requestId]/transition/route"

const origin = "http://localhost:3100"
const adminUserId = "admin-1"
const storeId = "demo-store"

async function useTempDatabase(): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-gbp-access-routes-"))
  vi.stubEnv("PLAYWRIGHT_TEST", "true")
  vi.stubEnv("GLOCALX_DB_PATH", join(tempPath, "routes.db"))
  resetDatabaseFile()
  const database = openDatabase()
  try {
    applyMigrations(database)
    seedDemoData(database)
    database
      .prepare(
        "INSERT INTO admin_users (id, email, password_hash, display_name, role, status, created_at) VALUES (?, 'op@example.com', 'hash', 'Op', 'OPERATOR', 'ACTIVE', ?)"
      )
      .run(adminUserId, new Date().toISOString())
  } finally {
    database.close()
  }
}

async function withDatabase<TResult>(
  work: (
    queryable: ReturnType<typeof createSqliteQueryable>
  ) => Promise<TResult>
): Promise<TResult> {
  const database = openDatabase()
  try {
    return await work(createSqliteQueryable(database))
  } finally {
    database.close()
  }
}

// A store that has just completed GBP connect: one access request in
// not_requested, the seam the operator flow starts from.
async function seedAccessRequest(): Promise<string> {
  return withDatabase(async (queryable) => {
    const request = await createDatabaseGbpAccessStore(
      queryable
    ).ensureGbpAccessRequest({ id: randomUUID(), storeId, now: new Date() })
    return request.id
  })
}

async function currentState(
  requestId: string
): Promise<GbpAccessState | undefined> {
  return withDatabase(async (queryable) => {
    const entry =
      await createDatabaseGbpAccessStore(queryable).getGbpAccessRequestById(
        requestId
      )
    return entry?.state
  })
}

async function auditActions(): Promise<readonly string[]> {
  return withDatabase(async (queryable) => {
    const rows = await queryable.query(
      "SELECT action FROM audit_logs ORDER BY created_at ASC"
    )
    return rows.map((row) => String(row["action"]))
  })
}

// A store whose owner claimed an already-org-managed listing in onboarding: the
// seam the operator verdict starts from.
async function seedAdoptionReview(
  gbpLocationRef: string | null = "locations/org-owned"
): Promise<string> {
  return withDatabase(async (queryable) => {
    const result = await createDatabaseGbpAccessStore(
      queryable
    ).openAdoptionReview({
      id: randomUUID(),
      storeId,
      gbpLocationRef,
      now: new Date(),
    })
    return result.request.id
  })
}

async function adminSessionCookie(): Promise<string> {
  return withDatabase(async (queryable) => {
    const sessionId =
      await createAdminAuthStore(queryable).createSession(adminUserId)
    return `glocalx_admin_session=${sessionId}`
  })
}

function transitionRequest(
  requestId: string,
  body: unknown,
  options: { readonly cookie?: string; readonly withOrigin?: boolean } = {}
): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (options.cookie !== undefined) {
    headers["Cookie"] = options.cookie
  }
  if (options.withOrigin !== false) {
    headers["Origin"] = origin
  }
  return new NextRequest(
    `${origin}/api/stores/access-requests/${requestId}/transition`,
    { body: JSON.stringify(body), headers, method: "POST" }
  )
}

function params(requestId: string): {
  readonly params: Promise<{ readonly requestId: string }>
} {
  return { params: Promise.resolve({ requestId }) }
}

beforeEach(async () => {
  await useTempDatabase()
})

describe("adoption verdict", () => {
  it("attaches the org listing to the store when an operator confirms", async () => {
    const requestId = await seedAdoptionReview("locations/hand-built")
    // The seeded demo store already carries a listing; clear it so the attach
    // under test is the only thing that could have written one.
    await withDatabase(async (queryable) => {
      await queryable.execute("DELETE FROM gbp_locations WHERE store_id = ?", [
        storeId,
      ])
    })

    const response = await transition(
      transitionRequest(
        requestId,
        { type: "CONFIRM_ADOPTION" },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )

    expect(response.status).toBe(200)
    expect(await currentState(requestId)).toBe("granted")
    // Without these rows the owner reads as connected but has nothing to
    // publish to, which is the failure this write exists to prevent.
    const locations = await withDatabase(async (queryable) =>
      queryable.query(
        "SELECT google_location_id AS id, status FROM gbp_locations WHERE store_id = ?",
        [storeId]
      )
    )
    expect(locations).toEqual([
      { id: "locations/hand-built", status: "VERIFIED" },
    ])
    expect(await auditActions()).toContain("gbp_access_confirm_adoption")
  })

  it("attaches the listing the operator picked, not the one the matcher guessed", async () => {
    const requestId = await seedAdoptionReview("locations/matcher-guess")
    await withDatabase(async (queryable) => {
      await queryable.execute("DELETE FROM gbp_locations WHERE store_id = ?", [
        storeId,
      ])
    })

    const response = await transition(
      transitionRequest(
        requestId,
        {
          type: "CONFIRM_ADOPTION",
          gbpLocationRef: "locations/operator-knows-better",
        },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )

    expect(response.status).toBe(200)
    // The matcher compares names and addresses; the operator built these
    // listings. A guess that survives the operator correcting it would connect
    // the owner to another customer's business.
    const locations = await withDatabase(async (queryable) =>
      queryable.query(
        "SELECT google_location_id AS id FROM gbp_locations WHERE store_id = ?",
        [storeId]
      )
    )
    expect(locations).toEqual([{ id: "locations/operator-knows-better" }])
    // Persisted too, so the console shows what was actually connected.
    const stored = await withDatabase(async (queryable) =>
      createDatabaseGbpAccessStore(queryable).getGbpAccessRequestById(requestId)
    )
    expect(stored?.gbpLocationRef).toBe("locations/operator-knows-better")
  })

  it("connects a claim the matcher could not resolve once an operator picks one", async () => {
    // The population this feature serves is hand-built listings, whose addresses
    // are typed inconsistently — so a miss is expected, not exceptional.
    const requestId = await seedAdoptionReview(null)
    await withDatabase(async (queryable) => {
      await queryable.execute("DELETE FROM gbp_locations WHERE store_id = ?", [
        storeId,
      ])
    })

    const response = await transition(
      transitionRequest(
        requestId,
        { type: "CONFIRM_ADOPTION", gbpLocationRef: "locations/hand-built" },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )

    expect(response.status).toBe(200)
    // The response row must already carry the operator's pick — the console
    // swaps the rendered card for this object, so a stale ref here shows the
    // matcher's guess while the database holds the operator's choice.
    expect((await response.json()).request.gbpLocationRef).toBe(
      "locations/hand-built"
    )
    expect(await currentState(requestId)).toBe("granted")
    const locations = await withDatabase(async (queryable) =>
      queryable.query(
        "SELECT google_location_id AS id FROM gbp_locations WHERE store_id = ?",
        [storeId]
      )
    )
    expect(locations).toEqual([{ id: "locations/hand-built" }])
  })

  it("refuses to confirm a claim that would attach no listing", async () => {
    const requestId = await seedAdoptionReview(null)

    const response = await transition(
      transitionRequest(
        requestId,
        { type: "CONFIRM_ADOPTION" },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )

    // Granting without a listing is the "connected to nothing" state the attach
    // exists to prevent, so it is a conflict rather than a silent success.
    expect(response.status).toBe(409)
    expect((await response.json()).status).toBe("MISSING_LOCATION_REF")
    // A refused adoption must not advance the state machine (#70): the guards
    // run before the transition is persisted, so the claim stays reviewable.
    expect(await currentState(requestId)).toBe("adoption_review")
  })

  it("reports the state conflict, not a guard error, for a stale confirm", async () => {
    // Request never entered adoption_review and the store keeps its seeded
    // listing. The hoisted guards must yield to the transition's
    // STATUS_CONFLICT here — the console's stale-view reload hint reads
    // currentState, which a guard 409 would hide.
    const requestId = await seedAccessRequest()

    const response = await transition(
      transitionRequest(
        requestId,
        { type: "CONFIRM_ADOPTION", gbpLocationRef: "locations/hand-built" },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )

    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.status).toBe("STATUS_CONFLICT")
    expect(body.currentState).toBe("not_requested")
    expect(await currentState(requestId)).toBe("not_requested")
  })

  it("404s a confirm for an unknown request before running guards", async () => {
    const response = await transition(
      transitionRequest(
        "missing",
        { type: "CONFIRM_ADOPTION", gbpLocationRef: "locations/hand-built" },
        { cookie: await adminSessionCookie() }
      ),
      params("missing")
    )

    expect(response.status).toBe(404)
  })

  it("refuses to attach a listing already adopted by another store", async () => {
    const otherStoreId = "other-demo-store"
    await withDatabase(async (queryable) => {
      await queryable.execute("DELETE FROM gbp_locations WHERE store_id = ?", [
        storeId,
      ])
      await queryable.execute(
        `INSERT INTO stores (id, owner_user_id, name, address, category, onboarding_status, created_at)
         SELECT ?, owner_user_id, '다른 가게', '서울', '카페', 'COMPLETED', ?
         FROM stores WHERE id = ?`,
        [otherStoreId, new Date().toISOString(), storeId]
      )
      await queryable.execute(
        `INSERT INTO gbp_accounts (id, store_id, google_account_id, account_name, created_at)
         VALUES ('other-gbp-account', ?, 'accounts/other', 'Other GBP', ?)`,
        [otherStoreId, new Date().toISOString()]
      )
      await queryable.execute(
        `INSERT INTO gbp_locations (id, store_id, gbp_account_id, google_location_id, status, created_at, updated_at)
         VALUES ('other-gbp-location', ?, 'other-gbp-account', 'locations/already-owned', 'VERIFIED', ?, ?)`,
        [otherStoreId, new Date().toISOString(), new Date().toISOString()]
      )
    })
    const requestId = await seedAdoptionReview("locations/already-owned")

    const response = await transition(
      transitionRequest(
        requestId,
        { type: "CONFIRM_ADOPTION" },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )

    // The picker has no way to know who already owns a listing; the server is
    // the only place left to catch two stores pointed at one Google location.
    expect(response.status).toBe(409)
    expect((await response.json()).status).toBe("LOCATION_ALREADY_ADOPTED")
    expect(await currentState(requestId)).toBe("adoption_review")
    const locations = await withDatabase(async (queryable) =>
      queryable.query(
        "SELECT google_location_id AS id FROM gbp_locations WHERE store_id = ?",
        [storeId]
      )
    )
    expect(locations).toEqual([])
  })

  it("refuses to re-adopt a store that already has an attached listing", async () => {
    // demo-store already carries locations/demo from the seed — left in place
    // this time, unlike the other tests, because that is exactly what is under
    // test here.
    const requestId = await seedAdoptionReview("locations/hand-built")

    const response = await transition(
      transitionRequest(
        requestId,
        { type: "CONFIRM_ADOPTION" },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )

    // Adoption is for stores with no listing yet; running it again would
    // silently repoint an already-working publish target.
    expect(response.status).toBe(409)
    expect((await response.json()).status).toBe("STORE_ALREADY_HAS_LOCATION")
    expect(await currentState(requestId)).toBe("adoption_review")
    const locations = await withDatabase(async (queryable) =>
      queryable.query(
        "SELECT google_location_id AS id FROM gbp_locations WHERE store_id = ?",
        [storeId]
      )
    )
    expect(locations).toEqual([{ id: "locations/demo" }])
  })

  it("sends the operator's reason to the owner's chat when a claim is rejected", async () => {
    const requestId = await seedAdoptionReview()
    const reason =
      "저희 계정에서 찾지 못했어요. 지도에 등록된 상호를 알려주시겠어요?"

    const response = await transition(
      transitionRequest(
        requestId,
        { type: "REJECT_ADOPTION", reason },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )

    expect(response.status).toBe(200)
    expect(await currentState(requestId)).toBe("blocked")

    // The owner must find something answerable in their thread, not a bare
    // "확인이 필요합니다" they cannot act on.
    const messages = await withDatabase(async (queryable) =>
      queryable.query(
        "SELECT body, sender, author_kind AS authorKind FROM cs_messages ORDER BY created_at DESC"
      )
    )
    expect(messages[0]).toEqual({
      body: reason,
      sender: "assistant",
      authorKind: "admin",
    })
    expect(await auditActions()).toContain("gbp_access_reject_adoption")
  })

  it("refuses a rejection with no reason before touching the request", async () => {
    const requestId = await seedAdoptionReview()

    const response = await transition(
      transitionRequest(
        requestId,
        { type: "REJECT_ADOPTION", reason: "   " },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )

    expect(response.status).toBe(400)
    expect(await currentState(requestId)).toBe("adoption_review")
  })
})

describe("gbp access transition route", () => {
  it("rejects an unauthenticated request", async () => {
    const requestId = await seedAccessRequest()
    const response = await transition(
      transitionRequest(requestId, { type: "SEND_INVITE" }),
      params(requestId)
    )
    expect(response.status).toBe(401)
    expect(await currentState(requestId)).toBe("not_requested")
  })

  it("rejects a cross-origin post before touching the database", async () => {
    const requestId = await seedAccessRequest()
    const response = await transition(
      transitionRequest(
        requestId,
        { type: "SEND_INVITE" },
        { cookie: await adminSessionCookie(), withOrigin: false }
      ),
      params(requestId)
    )
    expect(response.status).toBe(403)
    expect(await currentState(requestId)).toBe("not_requested")
  })

  it("advances a natural action and records the matching audit code", async () => {
    const requestId = await seedAccessRequest()
    const response = await transition(
      transitionRequest(
        requestId,
        { type: "SEND_INVITE" },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.request.state).toBe("invited")
    expect(await currentState(requestId)).toBe("invited")
    expect(await auditActions()).toContain("gbp_access_send_invite")
  })

  it("conflicts on an illegal transition without writing", async () => {
    const requestId = await seedAccessRequest()
    const response = await transition(
      transitionRequest(
        requestId,
        { type: "GRANT" },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.currentState).toBe("not_requested")
    expect(await currentState(requestId)).toBe("not_requested")
  })

  it("404s an unknown request", async () => {
    const response = await transition(
      transitionRequest(
        "missing",
        { type: "SEND_INVITE" },
        { cookie: await adminSessionCookie() }
      ),
      params("missing")
    )
    expect(response.status).toBe(404)
  })

  it("applies an out-of-band override and audits it distinctly", async () => {
    const requestId = await seedAccessRequest()
    const response = await transition(
      transitionRequest(
        requestId,
        { type: "OVERRIDE", targetState: "granted" },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )
    expect(response.status).toBe(200)
    expect(await currentState(requestId)).toBe("granted")
    expect(await auditActions()).toContain("gbp_access_override")
  })

  it("stores a BLOCK reason as the chase note", async () => {
    const requestId = await seedAccessRequest()
    await transition(
      transitionRequest(
        requestId,
        { type: "BLOCK", reason: "owner unreachable for two weeks" },
        { cookie: await adminSessionCookie() }
      ),
      params(requestId)
    )
    const note = await withDatabase(async (queryable) => {
      const entry =
        await createDatabaseGbpAccessStore(queryable).getGbpAccessRequestById(
          requestId
        )
      return entry?.note
    })
    expect(note).toBe("owner unreachable for two weeks")
  })
})

describe("gbp access note + list routes", () => {
  it("edits a chase note and audits it", async () => {
    const requestId = await seedAccessRequest()
    const response = await editNote(
      new NextRequest(
        `${origin}/api/stores/access-requests/${requestId}/note`,
        {
          body: JSON.stringify({ note: "called, will accept tonight" }),
          headers: {
            "Content-Type": "application/json",
            Cookie: await adminSessionCookie(),
            Origin: origin,
          },
          method: "POST",
        }
      ),
      params(requestId)
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.request.note).toBe("called, will accept tonight")
    expect(await auditActions()).toContain("gbp_access_note")
  })

  it("lists tracked stores for an authenticated operator", async () => {
    await seedAccessRequest()
    const response = await listStores(
      new NextRequest(`${origin}/api/stores/access-requests`, {
        headers: { Cookie: await adminSessionCookie() },
      })
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.stores).toHaveLength(1)
    expect(body.stores[0].storeName).toBeTruthy()
    expect(body.stores[0].state).toBe("not_requested")
  })
})
