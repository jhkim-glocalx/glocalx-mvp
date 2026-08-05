import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"
import { z } from "zod"

import { createIntegrationAdapters } from "@glocalx/integrations"
import type {
  ExternalFetch,
  GeocodeOutcome,
  GeocodingAdapter,
  IntegrationAdapters,
} from "@glocalx/integrations/contracts"
import { createProductionBusinessInformation } from "@glocalx/integrations/production"
import { applyMigrations, openDatabase, seedDemoData } from "@glocalx/db/sqlite"

import { setupGoogleBusinessProfile } from "./setup"
import {
  buildLiveGoogleLocationBody,
  resolveLiveGbpCredentials,
  runLiveGbpProvisioning,
} from "./setup-live"
import type { ConfirmedGbpStoreProfile } from "./store-profile"

const orgAppEnv = {
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
}

const orgFullEnv = {
  ...orgAppEnv,
  GOOGLE_ORG_REFRESH_TOKEN: "refresh-token",
  GOOGLE_BUSINESS_ACCOUNT_ID: "117964535166689865393",
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

type FakeGoogleOptions = {
  readonly onCall?: (url: string, init?: RequestInit) => void
  readonly search?: unknown
  readonly create?: unknown
  readonly searchStatus?: number
}

// Routes the exact request specs the production adapter builds to canned
// Google-shaped payloads so the live flow is exercised end to end without a
// network. Order of URL checks matters: create/validate share a path and
// differ only by the validateOnly query flag.
function createFakeGoogle(options: FakeGoogleOptions = {}): ExternalFetch {
  return async (url, init) => {
    options.onCall?.(url, init)
    if (url === "https://oauth2.googleapis.com/token") {
      return jsonResponse({ access_token: "org-access-token" })
    }
    if (url.endsWith("/googleLocations:search")) {
      return jsonResponse(
        options.search ?? { googleLocations: [] },
        options.searchStatus ?? 200
      )
    }
    if (url.startsWith("https://business.google.com")) {
      return jsonResponse({})
    }
    if (url.includes("/locations?") && url.includes("validateOnly=true")) {
      return jsonResponse({})
    }
    if (url.includes("/locations?") && url.includes("validateOnly=false")) {
      return jsonResponse(options.create ?? { name: "locations/live-123" })
    }
    throw new Error(`unexpected fetch to ${url}`)
  }
}

const confirmedProfile: ConfirmedGbpStoreProfile = {
  storeId: "demo-store",
  name: "라멘하우스 합정점",
  address: "서울 마포구 양화로 19",
  phone: "02-987-6543",
  category: "라멘",
  primaryCategoryId: "categories/gcid:ramen_restaurant",
}

function fixedGeocoding(outcome: GeocodeOutcome): GeocodingAdapter {
  return {
    async geocodeAddress() {
      return { kind: "ok", value: outcome }
    },
  }
}

describe("buildLiveGoogleLocationBody", () => {
  it("assembles a Korean location body with geocoded parts, latlng, and the gcid", async () => {
    const result = await buildLiveGoogleLocationBody({
      profile: confirmedProfile,
      geocoding: fixedGeocoding({
        kind: "resolved",
        address: {
          administrativeArea: "서울특별시",
          locality: "마포구",
          sublocality: "서교동",
          postalCode: "04039",
          latitude: 37.5563,
          longitude: 126.9236,
          formattedAddress: "대한민국 서울 마포구 양화로 19",
        },
      }),
    })

    expect(result).toEqual({
      kind: "ok",
      location: {
        languageCode: "ko",
        title: "라멘하우스 합정점",
        storeCode: "demo-store",
        storefrontAddress: {
          regionCode: "KR",
          languageCode: "ko",
          administrativeArea: "서울특별시",
          locality: "마포구",
          sublocality: "서교동",
          postalCode: "04039",
          addressLines: ["서울 마포구 양화로 19"],
        },
        latlng: { latitude: 37.5563, longitude: 126.9236 },
        phoneNumbers: { primaryPhone: "02-987-6543" },
        categories: {
          primaryCategory: { name: "categories/gcid:ramen_restaurant" },
        },
      },
    })
  })

  it("blocks when the owner has not picked a GBP category", async () => {
    const withoutCategory: ConfirmedGbpStoreProfile = {
      storeId: confirmedProfile.storeId,
      name: confirmedProfile.name,
      address: confirmedProfile.address,
      phone: confirmedProfile.phone,
      category: confirmedProfile.category,
    }
    const result = await buildLiveGoogleLocationBody({
      profile: withoutCategory,
      // A category block short-circuits before geocoding runs at all.
      geocoding: fixedGeocoding({ kind: "not_found" }),
    })
    expect(result).toEqual({ kind: "category_required" })
  })

  it("blocks with owner guidance when the address cannot be geocoded", async () => {
    const notFound = await buildLiveGoogleLocationBody({
      profile: confirmedProfile,
      geocoding: fixedGeocoding({ kind: "not_found" }),
    })
    const incomplete = await buildLiveGoogleLocationBody({
      profile: confirmedProfile,
      geocoding: fixedGeocoding({
        kind: "incomplete",
        missingComponents: ["postal_code"],
      }),
    })
    expect(notFound.kind).toBe("address_unresolved")
    expect(incomplete.kind).toBe("address_unresolved")
  })

  it("distinguishes a transient geocoding failure from a missing key", async () => {
    const upstream = await buildLiveGoogleLocationBody({
      profile: confirmedProfile,
      geocoding: fixedGeocoding({
        kind: "upstream_error",
        reason: "OVER_QUERY_LIMIT",
      }),
    })
    const blocked = await buildLiveGoogleLocationBody({
      profile: confirmedProfile,
      geocoding: {
        async geocodeAddress() {
          return {
            kind: "blocked_by_credentials",
            code: "BLOCKED_BY_CREDENTIALS",
            missingEnvVars: ["GOOGLE_GEOCODING_API_KEY"],
          }
        },
      },
    })
    expect(upstream).toEqual({ kind: "geocode_upstream_error" })
    expect(blocked).toEqual({
      kind: "geocode_blocked_by_credentials",
      missingEnvVars: ["GOOGLE_GEOCODING_API_KEY"],
    })
  })
})

describe("resolveLiveGbpCredentials", () => {
  it("returns the org token and qualified account name when configured", async () => {
    const result = await resolveLiveGbpCredentials({
      env: orgFullEnv,
      fetchImpl: createFakeGoogle(),
    })
    expect(result).toEqual({
      kind: "ok",
      credentials: {
        accessToken: "org-access-token",
        accountName: "accounts/117964535166689865393",
      },
    })
  })

  it("blocks and lists every missing credential, including the account id", async () => {
    const result = await resolveLiveGbpCredentials({
      env: { GOOGLE_CLIENT_ID: "client-id" },
      fetchImpl: createFakeGoogle(),
    })
    expect(result).toEqual({
      kind: "blocked_by_credentials",
      missingEnvVars: [
        "GOOGLE_CLIENT_SECRET",
        "GOOGLE_ORG_REFRESH_TOKEN",
        "GOOGLE_BUSINESS_ACCOUNT_ID",
      ],
    })
  })

  it("blocks on a missing account id alone", async () => {
    const result = await resolveLiveGbpCredentials({
      env: { ...orgAppEnv, GOOGLE_ORG_REFRESH_TOKEN: "refresh-token" },
      fetchImpl: createFakeGoogle(),
    })
    expect(result).toEqual({
      kind: "blocked_by_credentials",
      missingEnvVars: ["GOOGLE_BUSINESS_ACCOUNT_ID"],
    })
  })

  it("reports auth_failed when the refresh token is rejected", async () => {
    const fetchImpl: ExternalFetch = async () =>
      jsonResponse({ error: "invalid_grant" }, 400)
    const result = await resolveLiveGbpCredentials({
      env: orgFullEnv,
      fetchImpl,
    })
    expect(result).toEqual({ kind: "auth_failed" })
  })
})

describe("runLiveGbpProvisioning", () => {
  const credentials = {
    accessToken: "org-access-token",
    accountName: "accounts/117964535166689865393",
  }
  const location = { title: "테스트 매장", storeCode: "store-1" }

  it("creates a location and returns the Google-issued id", async () => {
    const calls: string[] = []
    let createAuth: string | undefined
    const fetchImpl = createFakeGoogle({
      onCall: (url, init) => {
        calls.push(url)
        if (url.includes("validateOnly=false")) {
          createAuth =
            new Headers(init?.headers).get("Authorization") ?? undefined
        }
      },
    })

    const result = await runLiveGbpProvisioning({
      adapters: {
        gbpBusinessInformation: createProductionBusinessInformation(orgAppEnv),
      },
      credentials,
      fetchImpl,
      location,
      requestId: "req-1",
    })

    expect(result).toEqual({
      kind: "provisioned",
      status: "VERIFICATION_PENDING",
      googleLocationId: "locations/live-123",
    })
    expect(createAuth).toBe("Bearer org-access-token")
    expect(calls.some((url) => url.includes("validateOnly=true"))).toBe(true)
    expect(
      calls.some((url) =>
        url.includes("accounts/117964535166689865393/locations")
      )
    ).toBe(true)
  })

  it("returns claim_required without creating when a match is owned", async () => {
    const calls: string[] = []
    const fetchImpl = createFakeGoogle({
      onCall: (url) => calls.push(url),
      search: {
        googleLocations: [
          {
            name: "googleLocations/claimed-1",
            requestAdminRightsUri: "https://business.google.com/arr?a=1",
          },
        ],
      },
    })

    const result = await runLiveGbpProvisioning({
      adapters: {
        gbpBusinessInformation: createProductionBusinessInformation(orgAppEnv),
      },
      credentials,
      fetchImpl,
      location,
      requestId: "req-1",
    })

    expect(result).toEqual({
      kind: "claim_required",
      googleLocationId: "googleLocations/claimed-1",
      requestAdminRightsUrl: "https://business.google.com/arr?a=1",
    })
    expect(calls.some((url) => url.includes("validateOnly=false"))).toBe(false)
  })

  it("surfaces an upstream error when Google rejects the token", async () => {
    const fetchImpl = createFakeGoogle({ searchStatus: 401 })
    const result = await runLiveGbpProvisioning({
      adapters: {
        gbpBusinessInformation: createProductionBusinessInformation(orgAppEnv),
      },
      credentials,
      fetchImpl,
      location,
      requestId: "req-1",
    })
    expect(result.kind).toBe("upstream_error")
  })
})

const liveAccountRowSchema = z.object({
  account_name: z.string(),
  google_location_id: z.string(),
})

describe("setupGoogleBusinessProfile (production dispatch)", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  async function createDatabase() {
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-gbp-live-"))
    tempPaths.push(tempPath)
    const database = openDatabase(join(tempPath, "gbp.db"))
    applyMigrations(database)
    seedDemoData(database)
    // The live path builds a locations.create body from an owner-picked gcid, so
    // the demo store needs one selected before it can reach credentials/creation.
    database
      .prepare(
        "UPDATE stores SET gbp_primary_category_id = ?, gbp_primary_category_display_name = ? WHERE id = ?"
      )
      .run("categories/gcid:restaurant", "음식점", "demo-store")
    return database
  }

  function productionAdapters(database: ReturnType<typeof openDatabase>) {
    const stub = createIntegrationAdapters({ database, env: {} })
    const adapters: IntegrationAdapters = {
      ...stub,
      mode: "production",
      gbpBusinessInformation: createProductionBusinessInformation(orgAppEnv),
    }
    return adapters
  }

  it("persists the real org account name and Google location id", async () => {
    const database = await createDatabase()
    const result = await setupGoogleBusinessProfile({
      adapters: productionAdapters(database),
      database,
      env: orgFullEnv,
      fetchImpl: createFakeGoogle(),
      mode: "production",
      storeId: "demo-store",
    })

    expect(result.status).toBe("VERIFICATION_PENDING")
    const row = liveAccountRowSchema.parse(
      database
        .prepare(
          `SELECT account.account_name AS account_name,
                  location.google_location_id AS google_location_id
             FROM gbp_locations AS location
             JOIN gbp_accounts AS account ON account.id = location.gbp_account_id
            WHERE location.id = 'setup-gbp-location'`
        )
        .get()
    )
    expect(row).toEqual({
      account_name: "accounts/117964535166689865393",
      google_location_id: "locations/live-123",
    })
    database.close()
  })

  it("blocks when the org credentials are missing", async () => {
    const database = await createDatabase()
    const result = await setupGoogleBusinessProfile({
      adapters: productionAdapters(database),
      database,
      env: {},
      fetchImpl: createFakeGoogle(),
      mode: "production",
      storeId: "demo-store",
    })
    expect(result.status).toBe("BLOCKED_BY_CREDENTIALS")
    database.close()
  })

  it("blocks before Google when the owner has not picked a category", async () => {
    const database = await createDatabase()
    database
      .prepare("UPDATE stores SET gbp_primary_category_id = NULL WHERE id = ?")
      .run("demo-store")
    let reachedGoogle = false
    const result = await setupGoogleBusinessProfile({
      adapters: productionAdapters(database),
      database,
      env: orgFullEnv,
      fetchImpl: createFakeGoogle({ onCall: () => (reachedGoogle = true) }),
      mode: "production",
      storeId: "demo-store",
    })
    expect(result.status).toBe("CATEGORY_REQUIRED")
    // Category is a precondition for building the request, so nothing hits Google.
    expect(reachedGoogle).toBe(false)
    database.close()
  })

  it("blocks before Google when the address cannot be geocoded", async () => {
    const database = await createDatabase()
    // The stub geocoder returns not_found for addresses carrying this marker.
    database
      .prepare("UPDATE stores SET address = ? WHERE id = ?")
      .run("geocode-fail 123", "demo-store")
    let reachedGoogle = false
    const result = await setupGoogleBusinessProfile({
      adapters: productionAdapters(database),
      database,
      env: orgFullEnv,
      fetchImpl: createFakeGoogle({ onCall: () => (reachedGoogle = true) }),
      mode: "production",
      storeId: "demo-store",
    })
    expect(result.status).toBe("ADDRESS_NOT_GEOCODABLE")
    expect(reachedGoogle).toBe(false)
    database.close()
  })
})
