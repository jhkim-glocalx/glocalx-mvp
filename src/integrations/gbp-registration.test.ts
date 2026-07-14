import { describe, expect, it, vi } from "vitest"

import { createProductionBusinessInformation } from "./production"

const productionEnv = {
  GOOGLE_CLIENT_ID: "test-google-client",
  GOOGLE_CLIENT_SECRET: "test-google-secret",
} as const

describe("production GBP registration adapter", () => {
  it("executes account discovery, duplicate search, validation, and creation", async () => {
    // Given
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          accounts: [{ accountName: "Owner", name: "accounts/123" }],
        })
      )
      .mockResolvedValueOnce(Response.json({ googleLocations: [] }))
      .mockResolvedValueOnce(
        Response.json({
          categories: [
            {
              displayName: "브런치 식당",
              name: "categories/gcid:brunch_restaurant",
            },
          ],
        })
      )
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({ name: "locations/456" }))
    const adapter = createProductionBusinessInformation(
      productionEnv,
      fetchImpl
    )
    const searchLocation = {
      locationName: "브런치모먼트 홍대점",
      address: { regionCode: "KR", addressLines: ["서울 마포구"] },
      languageCode: "ko",
      primaryPhone: "02-1234-5678",
    }
    const createLocation = {
      languageCode: "ko",
      title: "브런치모먼트 홍대점",
    }

    // When
    const accounts = await adapter.listAccounts({
      accessToken: "owner-token",
    })
    const matches = await adapter.searchLocations({
      accessToken: "owner-token",
      location: searchLocation,
    })
    const category = await adapter.findCategory({
      accessToken: "owner-token",
      displayName: "브런치 식당",
    })
    const validation = await adapter.validateLocation({
      accessToken: "owner-token",
      accountName: "accounts/123",
      location: createLocation,
      requestId: "request-123",
    })
    const creation = await adapter.createLocation({
      accessToken: "owner-token",
      accountName: "accounts/123",
      location: createLocation,
      requestId: "request-123",
    })

    // Then
    expect(accounts).toEqual({
      kind: "ok",
      value: {
        accounts: [{ accountName: "Owner", name: "accounts/123" }],
      },
    })
    expect(matches).toEqual({ kind: "ok", value: { matches: [] } })
    expect(category).toEqual({
      kind: "ok",
      value: {
        category: {
          displayName: "브런치 식당",
          name: "categories/gcid:brunch_restaurant",
        },
      },
    })
    expect(validation).toEqual({ kind: "ok", value: undefined })
    expect(creation).toEqual({
      kind: "ok",
      value: { googleLocationId: "locations/456" },
    })
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      expect.objectContaining({ method: "GET" })
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://mybusiness.googleapis.com/v4/googleLocations:search",
      expect.objectContaining({
        body: JSON.stringify({ location: searchLocation, resultCount: 10 }),
        method: "POST",
      })
    )
    expect(fetchImpl).toHaveBeenCalledTimes(5)
  })

  it("rejects ambiguous exact category matches", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        categories: [
          { displayName: "카페", name: "categories/gcid:cafe" },
          { displayName: "카페", name: "categories/gcid:coffee_shop" },
        ],
      })
    )
    const adapter = createProductionBusinessInformation(
      productionEnv,
      fetchImpl
    )

    const result = await adapter.findCategory({
      accessToken: "owner-token",
      displayName: "카페",
    })

    expect(result).toEqual({ kind: "ok", value: { category: undefined } })
  })
})
