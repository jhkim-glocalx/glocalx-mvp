import { describe, expect, it } from "vitest"

import type { ExternalFetch } from "./contracts"
import { createStubGeocoding } from "./stub"
import {
  buildGoogleGeocodingRequest,
  createProductionGeocoding,
} from "./geocoding-production"

const configuredEnv = { GOOGLE_GEOCODING_API_KEY: "geocoding-key" }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function component(long: string, types: readonly string[]) {
  return { long_name: long, short_name: long, types }
}

// Mirrors a real Geocoding response for a Seoul road address (gu on `locality`).
const seoulOkResponse = {
  status: "OK",
  results: [
    {
      formatted_address: "대한민국 서울특별시 종로구 북촌로5길 76",
      address_components: [
        component("서울특별시", ["administrative_area_level_1", "political"]),
        component("종로구", ["locality", "political"]),
        component("가회동", ["sublocality_level_2", "sublocality"]),
        component("03053", ["postal_code"]),
      ],
      geometry: { location: { lat: 37.5800995, lng: 126.9808429 } },
    },
  ],
}

describe("buildGoogleGeocodingRequest", () => {
  it("targets the Geocoding endpoint with ko/kr bias and the key query param", () => {
    const spec = buildGoogleGeocodingRequest(configuredEnv, {
      address: "서울특별시 종로구 북촌로5길 76",
    })
    const url = new URL(spec.url)

    expect(spec.method).toBe("GET")
    expect(url.origin + url.pathname).toBe(
      "https://maps.googleapis.com/maps/api/geocode/json"
    )
    expect(url.searchParams.get("address")).toBe(
      "서울특별시 종로구 북촌로5길 76"
    )
    expect(url.searchParams.get("language")).toBe("ko")
    expect(url.searchParams.get("region")).toBe("kr")
    expect(url.searchParams.get("key")).toBe("geocoding-key")
  })
})

describe("createProductionGeocoding", () => {
  it("blocks without printing secrets when the key is missing", async () => {
    const adapter = createProductionGeocoding({}, async () => {
      throw new Error("fetch must not run without a key")
    })

    const result = await adapter.geocodeAddress({ address: "any" })

    expect(result).toEqual({
      kind: "blocked_by_credentials",
      code: "BLOCKED_BY_CREDENTIALS",
      missingEnvVars: ["GOOGLE_GEOCODING_API_KEY"],
    })
  })

  it("resolves an address into GBP-ready components and coordinates", async () => {
    const fetchImpl: ExternalFetch = async () => jsonResponse(seoulOkResponse)
    const adapter = createProductionGeocoding(configuredEnv, fetchImpl)

    const result = await adapter.geocodeAddress({
      address: "서울특별시 종로구 북촌로5길 76",
    })

    expect(result).toEqual({
      kind: "ok",
      value: {
        kind: "resolved",
        address: {
          administrativeArea: "서울특별시",
          locality: "종로구",
          sublocality: "가회동",
          postalCode: "03053",
          latitude: 37.5800995,
          longitude: 126.9808429,
          formattedAddress: "대한민국 서울특별시 종로구 북촌로5길 76",
        },
      },
    })
  })

  it("falls back to sublocality_level_1 for the gu outside special cities", async () => {
    const response = {
      status: "OK",
      results: [
        {
          formatted_address: "대한민국 경기도 성남시 분당구 판교역로 152",
          address_components: [
            component("경기도", ["administrative_area_level_1"]),
            component("성남시", ["administrative_area_level_2"]),
            component("분당구", ["sublocality_level_1", "sublocality"]),
            component("13529", ["postal_code"]),
          ],
          geometry: { location: { lat: 37.3947, lng: 127.1112 } },
        },
      ],
    }
    const adapter = createProductionGeocoding(configuredEnv, async () =>
      jsonResponse(response)
    )

    const result = await adapter.geocodeAddress({
      address: "경기도 성남시 분당구 판교역로 152",
    })

    expect(result).toMatchObject({
      value: { kind: "resolved", address: { locality: "분당구" } },
    })
  })

  it("reports incomplete when a required component (postal code) is absent", async () => {
    const response = {
      status: "OK",
      results: [
        {
          formatted_address: "대한민국 서울특별시 종로구",
          address_components: [
            component("서울특별시", ["administrative_area_level_1"]),
            component("종로구", ["locality"]),
          ],
          geometry: { location: { lat: 37.58, lng: 126.98 } },
        },
      ],
    }
    const adapter = createProductionGeocoding(configuredEnv, async () =>
      jsonResponse(response)
    )

    const result = await adapter.geocodeAddress({
      address: "서울특별시 종로구",
    })

    expect(result).toEqual({
      kind: "ok",
      value: { kind: "incomplete", missingComponents: ["postal_code"] },
    })
  })

  it("maps ZERO_RESULTS to not_found", async () => {
    const adapter = createProductionGeocoding(configuredEnv, async () =>
      jsonResponse({ status: "ZERO_RESULTS", results: [] })
    )

    const result = await adapter.geocodeAddress({ address: "존재하지않는주소" })

    expect(result).toEqual({ kind: "ok", value: { kind: "not_found" } })
  })

  it("maps REQUEST_DENIED (bad/unauthorized key) to an upstream error", async () => {
    const adapter = createProductionGeocoding(configuredEnv, async () =>
      jsonResponse({ status: "REQUEST_DENIED", error_message: "denied" })
    )

    const result = await adapter.geocodeAddress({ address: "서울" })

    expect(result).toEqual({
      kind: "ok",
      value: { kind: "upstream_error", reason: "REQUEST_DENIED" },
    })
  })

  it("maps a non-2xx HTTP response to an upstream error", async () => {
    const adapter = createProductionGeocoding(configuredEnv, async () =>
      jsonResponse({ status: "OK" }, 503)
    )

    const result = await adapter.geocodeAddress({ address: "서울" })

    expect(result).toEqual({
      kind: "ok",
      value: { kind: "upstream_error", reason: "HTTP_ERROR" },
    })
  })

  it("maps a network failure to an upstream error", async () => {
    const adapter = createProductionGeocoding(configuredEnv, async () => {
      throw new TypeError("network down")
    })

    const result = await adapter.geocodeAddress({ address: "서울" })

    expect(result).toEqual({
      kind: "ok",
      value: { kind: "upstream_error", reason: "NETWORK_ERROR" },
    })
  })

  it("maps an unparsable body to an upstream error", async () => {
    const adapter = createProductionGeocoding(
      configuredEnv,
      async () =>
        new Response("<html>not json</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        })
    )

    const result = await adapter.geocodeAddress({ address: "서울" })

    expect(result).toEqual({
      kind: "ok",
      value: { kind: "upstream_error", reason: "MALFORMED_RESPONSE" },
    })
  })
})

describe("createStubGeocoding", () => {
  it("returns a deterministic resolved address for ordinary input", async () => {
    const result = await createStubGeocoding().geocodeAddress({
      address: "서울 마포구 와우산로 123",
    })

    expect(result).toMatchObject({
      kind: "ok",
      value: {
        kind: "resolved",
        address: { administrativeArea: "서울특별시", postalCode: "04039" },
      },
    })
  })

  it("simulates not_found and incomplete via sentinel inputs", async () => {
    const stub = createStubGeocoding()

    await expect(
      stub.geocodeAddress({ address: "geocode-fail 매장" })
    ).resolves.toEqual({ kind: "ok", value: { kind: "not_found" } })

    await expect(
      stub.geocodeAddress({ address: "no-postal 매장" })
    ).resolves.toEqual({
      kind: "ok",
      value: { kind: "incomplete", missingComponents: ["postal_code"] },
    })
  })
})
