import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  applyMigrations,
  openDatabase,
  resetDatabaseFile,
  seedDemoData,
} from "@glocalx/db/sqlite"

import { GET as listRequests, POST as createRequest } from "./requests/route"
import { POST as createUploadToken } from "./requests/[requestId]/upload-token/route"
import { POST as registerAsset } from "./requests/[requestId]/assets/route"

const demoCookieHeader =
  "glocalx_demo_session=demo-owner; glocalx_demo_store=demo-store"
const otherStoreCookieHeader =
  "glocalx_demo_session=other-user; glocalx_demo_store=other-demo-store"
const tempPaths: string[] = []

async function useTempDatabase(): Promise<void> {
  const tempPath = await mkdtemp(join(tmpdir(), "glocalx-campaign-routes-"))
  tempPaths.push(tempPath)
  vi.stubEnv("PLAYWRIGHT_TEST", "true")
  vi.stubEnv("GLOCALX_DB_PATH", join(tempPath, "routes.db"))
  resetDatabaseFile()
  const database = openDatabase()
  try {
    applyMigrations(database)
    seedDemoData(database)
    database
      .prepare(
        "INSERT INTO users (id, email, display_name, role, created_at) VALUES ('other-user', 'other@example.com', 'Other', 'OWNER', ?)"
      )
      .run(new Date().toISOString())
    database
      .prepare(
        "INSERT INTO stores (id, owner_user_id, name, address, category, onboarding_status, created_at) VALUES ('other-demo-store', 'other-user', 'Other', 'addr', 'cat', 'COMPLETED', ?)"
      )
      .run(new Date().toISOString())
  } finally {
    database.close()
  }
}

function jsonRequest(
  url: string,
  body: unknown,
  cookieHeader?: string
): NextRequest {
  return new NextRequest(url, {
    body: JSON.stringify(body),
    headers: {
      ...(cookieHeader === undefined ? {} : { Cookie: cookieHeader }),
      "Content-Type": "application/json",
    },
    method: "POST",
  })
}

function getRequest(url: string, cookieHeader?: string): NextRequest {
  return new NextRequest(url, {
    headers: cookieHeader === undefined ? {} : { Cookie: cookieHeader },
    method: "GET",
  })
}

const requestsUrl = "http://localhost:3000/api/campaigns/requests"

async function createDemoCampaignRequest(): Promise<string> {
  const response = await createRequest(
    jsonRequest(
      requestsUrl,
      { brief: "Promote our brunch menu" },
      demoCookieHeader
    )
  )
  const body = (await response.json()) as { request: { id: string } }
  return body.request.id
}

describe("campaign request routes", () => {
  beforeEach(async () => {
    await useTempDatabase()
  })

  afterEach(async () => {
    resetDatabaseFile()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  it("requires a session to create a request", async () => {
    const response = await createRequest(
      jsonRequest(requestsUrl, { brief: "Promote our brunch menu" })
    )
    expect(response.status).toBe(401)
  })

  it("rejects an empty brief", async () => {
    const response = await createRequest(
      jsonRequest(requestsUrl, { brief: "" }, demoCookieHeader)
    )
    expect(response.status).toBe(400)
  })

  it("creates a submitted request and lists it back", async () => {
    const created = await createRequest(
      jsonRequest(
        requestsUrl,
        { brief: "Promote our brunch menu" },
        demoCookieHeader
      )
    )
    expect(created.status).toBe(201)
    const createdBody = (await created.json()) as {
      request: { id: string; status: string; brief: string }
    }
    expect(createdBody.request.status).toBe("submitted")

    const listed = await listRequests(getRequest(requestsUrl, demoCookieHeader))
    const listedBody = (await listed.json()) as {
      requests: readonly { id: string; assetCount: number }[]
    }
    expect(listedBody.requests).toHaveLength(1)
    expect(listedBody.requests[0]?.id).toBe(createdBody.request.id)
    expect(listedBody.requests[0]?.assetCount).toBe(0)
  })

  it("scopes the list to the session's own store", async () => {
    await createDemoCampaignRequest()

    const listed = await listRequests(
      getRequest(requestsUrl, otherStoreCookieHeader)
    )
    const listedBody = (await listed.json()) as { requests: readonly unknown[] }
    expect(listedBody.requests).toHaveLength(0)
  })

  it("issues an upload token in stub mode for an owned request", async () => {
    const requestId = await createDemoCampaignRequest()

    const response = await createUploadToken(
      jsonRequest(
        `${requestsUrl}/${requestId}/upload-token`,
        {
          filename: "photo.jpg",
          contentType: "image/jpeg",
          sizeBytes: 512_000,
        },
        demoCookieHeader
      ),
      { params: Promise.resolve({ requestId }) }
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      mode: string
      uploadToken: string
      pathname: string
      blobUrl: string
    }
    expect(body.mode).toBe("stub")
    expect(body.uploadToken).toMatch(/^stub_upload_token_/)
    expect(body.blobUrl).toContain(`stores/demo-store/`)
  })

  it("404s an upload token request for another store's campaign request", async () => {
    const requestId = await createDemoCampaignRequest()

    const response = await createUploadToken(
      jsonRequest(
        `${requestsUrl}/${requestId}/upload-token`,
        {
          filename: "photo.jpg",
          contentType: "image/jpeg",
          sizeBytes: 512_000,
        },
        otherStoreCookieHeader
      ),
      { params: Promise.resolve({ requestId }) }
    )

    expect(response.status).toBe(404)
  })

  it("rejects a disallowed content type before calling the media store", async () => {
    const requestId = await createDemoCampaignRequest()

    const response = await createUploadToken(
      jsonRequest(
        `${requestsUrl}/${requestId}/upload-token`,
        {
          filename: "doc.pdf",
          contentType: "application/pdf",
          sizeBytes: 1000,
        },
        demoCookieHeader
      ),
      { params: Promise.resolve({ requestId }) }
    )

    expect(response.status).toBe(400)
  })

  it("registers an asset after a successful upload-token round trip", async () => {
    const requestId = await createDemoCampaignRequest()
    const tokenResponse = await createUploadToken(
      jsonRequest(
        `${requestsUrl}/${requestId}/upload-token`,
        {
          filename: "photo.jpg",
          contentType: "image/jpeg",
          sizeBytes: 512_000,
        },
        demoCookieHeader
      ),
      { params: Promise.resolve({ requestId }) }
    )
    const { blobUrl } = (await tokenResponse.json()) as { blobUrl: string }

    const response = await registerAsset(
      jsonRequest(
        `${requestsUrl}/${requestId}/assets`,
        { blobUrl, kind: "original" },
        demoCookieHeader
      ),
      { params: Promise.resolve({ requestId }) }
    )

    expect(response.status).toBe(201)
    const body = (await response.json()) as {
      asset: { contentType: string; sizeBytes: number; uploadedBy: string }
    }
    expect(body.asset).toMatchObject({
      contentType: "image/jpeg",
      sizeBytes: 512_000,
      uploadedBy: "owner",
    })

    const listed = await listRequests(getRequest(requestsUrl, demoCookieHeader))
    const listedBody = (await listed.json()) as {
      requests: readonly { assetCount: number }[]
    }
    expect(listedBody.requests[0]?.assetCount).toBe(1)
  })

  it("404s asset registration for a blob url the media store never issued", async () => {
    const requestId = await createDemoCampaignRequest()

    const response = await registerAsset(
      jsonRequest(
        `${requestsUrl}/${requestId}/assets`,
        {
          blobUrl:
            "https://stub.blob.glocalx.internal/stores/demo-store/never-uploaded.jpg",
          kind: "original",
        },
        demoCookieHeader
      ),
      { params: Promise.resolve({ requestId }) }
    )

    expect(response.status).toBe(404)
  })

  it("rejects extra client-claimed fields on asset registration (.strict())", async () => {
    const requestId = await createDemoCampaignRequest()
    const tokenResponse = await createUploadToken(
      jsonRequest(
        `${requestsUrl}/${requestId}/upload-token`,
        {
          filename: "photo.jpg",
          contentType: "image/jpeg",
          sizeBytes: 512_000,
        },
        demoCookieHeader
      ),
      { params: Promise.resolve({ requestId }) }
    )
    const { blobUrl } = (await tokenResponse.json()) as { blobUrl: string }

    const response = await registerAsset(
      jsonRequest(
        `${requestsUrl}/${requestId}/assets`,
        { blobUrl, kind: "original", contentType: "image/jpeg", sizeBytes: 1 },
        demoCookieHeader
      ),
      { params: Promise.resolve({ requestId }) }
    )

    expect(response.status).toBe(400)
  })
})
