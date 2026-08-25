import { describe, expect, it } from "vitest"

import { listOrgLocations } from "./gbp-org-locations"
import type {
  GbpBusinessInformationAdapter,
  ListOrgLocationsResult,
} from "./gbp-contracts"
import type { AdapterResult, HttpRequestSpec } from "./contracts"

function location(name: string): {
  readonly name: string
  readonly title: string
  readonly addressLine: string
} {
  return { name, title: name, addressLine: "" }
}

// Stub mode's adapter answers with concrete ListOrgLocationsResult pages
// (never a request spec), so pagination is exercised via nextPageToken here
// the same way it is in stub mode.
function stubModeAdapter(
  pages: readonly ListOrgLocationsResult[]
): GbpBusinessInformationAdapter {
  return {
    async listOrgLocations(input) {
      const index = input.pageToken === undefined ? 0 : Number(input.pageToken)
      const page = pages[index]
      const result: AdapterResult<ListOrgLocationsResult | HttpRequestSpec> = {
        kind: "ok",
        value: page ?? { locations: [] },
      }
      return result
    },
    async searchLocations() {
      return { kind: "ok", value: { matches: [] } }
    },
    async requestAdminRights() {
      throw new Error("not used")
    },
    async validateLocation() {
      throw new Error("not used")
    },
    async createLocation() {
      throw new Error("not used")
    },
  }
}

describe("listOrgLocations pagination", () => {
  it("follows nextPageToken across multiple pages and accumulates all locations", async () => {
    const outcome = await listOrgLocations({
      adapters: {
        gbpBusinessInformation: stubModeAdapter([
          { locations: [location("locations/1")], nextPageToken: "1" },
          { locations: [location("locations/2")], nextPageToken: "2" },
          { locations: [location("locations/3")] },
        ]),
        mode: "stub",
      },
      env: {},
      fetchImpl: (async () => {
        throw new Error("not used in stub mode")
      }) as never,
    })

    expect(outcome.kind).toBe("ok")
    if (outcome.kind !== "ok") {
      throw new Error("expected ok")
    }
    expect(outcome.locations.map((entry) => entry.name)).toEqual([
      "locations/1",
      "locations/2",
      "locations/3",
    ])
  })

  it("stops at a single page when nextPageToken is absent", async () => {
    const outcome = await listOrgLocations({
      adapters: {
        gbpBusinessInformation: stubModeAdapter([
          { locations: [location("locations/only")] },
        ]),
        mode: "stub",
      },
      env: {},
      fetchImpl: (async () => {
        throw new Error("not used in stub mode")
      }) as never,
    })

    expect(outcome.kind).toBe("ok")
    if (outcome.kind !== "ok") {
      throw new Error("expected ok")
    }
    expect(outcome.locations).toHaveLength(1)
  })

  it("caps runaway pagination instead of looping forever", async () => {
    // Every page hands back the next page's index as its token forever —
    // the org account never actually has this many listings, this
    // simulates a Google response that never terminates.
    const adapter: GbpBusinessInformationAdapter = {
      async listOrgLocations(input) {
        const index =
          input.pageToken === undefined ? 0 : Number(input.pageToken)
        return {
          kind: "ok",
          value: {
            locations: [location(`locations/${index}`)],
            nextPageToken: String(index + 1),
          },
        }
      },
      async searchLocations() {
        return { kind: "ok", value: { matches: [] } }
      },
      async requestAdminRights() {
        throw new Error("not used")
      },
      async validateLocation() {
        throw new Error("not used")
      },
      async createLocation() {
        throw new Error("not used")
      },
    }

    const outcome = await listOrgLocations({
      adapters: { gbpBusinessInformation: adapter, mode: "stub" },
      env: {},
      fetchImpl: (async () => {
        throw new Error("not used in stub mode")
      }) as never,
    })

    expect(outcome.kind).toBe("ok")
    if (outcome.kind !== "ok") {
      throw new Error("expected ok")
    }
    // 50-page cap (maxOrgLocationsPages), one location per page.
    expect(outcome.locations).toHaveLength(50)
  })
})
