import { z } from "zod"

import { blockedByCredentials, missingEnvVars } from "./credentials"
import type {
  AdapterEnvironment,
  AdapterResult,
  ExternalFetch,
  HttpRequestSpec,
} from "./contracts"
import type {
  GeocodeAddressInput,
  GeocodeOutcome,
  GeocodeUpstreamReason,
  GeocodedAddress,
  GeocodingAdapter,
} from "./geocoding-contracts"

export const geocodingEnvVars = ["GOOGLE_GEOCODING_API_KEY"] as const
const geocodeUrl = "https://maps.googleapis.com/maps/api/geocode/json"

const addressComponentSchema = z
  .object({
    long_name: z.string(),
    short_name: z.string(),
    types: z.array(z.string()),
  })
  .passthrough()

const geocodeResultSchema = z
  .object({
    formatted_address: z.string().optional(),
    address_components: z.array(addressComponentSchema),
    geometry: z.object({
      location: z.object({ lat: z.number(), lng: z.number() }),
    }),
  })
  .passthrough()

const geocodeResponseSchema = z
  .object({
    status: z.string(),
    results: z.array(geocodeResultSchema).optional(),
    error_message: z.string().optional(),
  })
  .passthrough()

type GeocodeResult = z.infer<typeof geocodeResultSchema>

export function buildGoogleGeocodingRequest(
  env: AdapterEnvironment,
  input: GeocodeAddressInput
): HttpRequestSpec {
  const url = new URL(geocodeUrl)
  url.searchParams.set("address", input.address)
  // ko/kr bias the components so a Korean road address resolves to Korean
  // administrative names and a KR postal code rather than a foreign match.
  url.searchParams.set("language", "ko")
  url.searchParams.set("region", "kr")
  // The Geocoding API only authenticates via the `key` query parameter — it has
  // no header form — so the service key rides in the URL by Google's contract.
  url.searchParams.set("key", env["GOOGLE_GEOCODING_API_KEY"] ?? "")

  return { method: "GET", url: url.toString(), headers: {} }
}

function findComponent(
  result: GeocodeResult,
  type: string
): string | undefined {
  const value = result.address_components.find((component) =>
    component.types.includes(type)
  )?.long_name
  return value?.trim() ? value.trim() : undefined
}

function toOutcome(result: GeocodeResult): GeocodeOutcome {
  const administrativeArea = findComponent(
    result,
    "administrative_area_level_1"
  )
  // Seoul-style special cities surface the gu as `locality`; most other regions
  // put the si/gu on `sublocality_level_1`, so accept either.
  const locality =
    findComponent(result, "locality") ??
    findComponent(result, "sublocality_level_1")
  const postalCode = findComponent(result, "postal_code")
  const sublocality = findComponent(result, "sublocality_level_2")

  const missingComponents = [
    ...(administrativeArea === undefined
      ? ["administrative_area_level_1"]
      : []),
    ...(locality === undefined ? ["locality"] : []),
    ...(postalCode === undefined ? ["postal_code"] : []),
  ]
  if (
    administrativeArea === undefined ||
    locality === undefined ||
    postalCode === undefined
  ) {
    return { kind: "incomplete", missingComponents }
  }

  const address: GeocodedAddress = {
    administrativeArea,
    locality,
    postalCode,
    latitude: result.geometry.location.lat,
    longitude: result.geometry.location.lng,
    formattedAddress: result.formatted_address ?? "",
    ...(sublocality === undefined ? {} : { sublocality }),
  }
  return { kind: "resolved", address }
}

function upstreamOutcome(reason: GeocodeUpstreamReason): GeocodeOutcome {
  return { kind: "upstream_error", reason }
}

function statusToOutcome(status: string): GeocodeOutcome | undefined {
  switch (status) {
    case "OK":
      return undefined
    case "ZERO_RESULTS":
      return { kind: "not_found" }
    case "REQUEST_DENIED":
      return upstreamOutcome("REQUEST_DENIED")
    case "OVER_QUERY_LIMIT":
      return upstreamOutcome("OVER_QUERY_LIMIT")
    default:
      // INVALID_REQUEST, UNKNOWN_ERROR, and any future status collapse to a
      // single retryable-looking upstream error for the caller.
      return upstreamOutcome("INVALID_REQUEST")
  }
}

export function createProductionGeocoding(
  env: AdapterEnvironment,
  fetchImpl: ExternalFetch
): GeocodingAdapter {
  return {
    async geocodeAddress(input): Promise<AdapterResult<GeocodeOutcome>> {
      const missing = missingEnvVars(env, geocodingEnvVars)
      if (missing.length > 0) {
        return blockedByCredentials(missing)
      }

      const request = buildGoogleGeocodingRequest(env, input)
      let response: Response
      try {
        response = await fetchImpl(request.url, {
          method: request.method,
          headers: request.headers,
          signal: AbortSignal.timeout(6000),
        })
      } catch {
        return { kind: "ok", value: upstreamOutcome("NETWORK_ERROR") }
      }

      if (!response.ok) {
        return { kind: "ok", value: upstreamOutcome("HTTP_ERROR") }
      }

      const parsed = geocodeResponseSchema.safeParse(await readJson(response))
      if (!parsed.success) {
        return { kind: "ok", value: upstreamOutcome("MALFORMED_RESPONSE") }
      }

      const statusOutcome = statusToOutcome(parsed.data.status)
      if (statusOutcome !== undefined) {
        return { kind: "ok", value: statusOutcome }
      }

      const firstResult = parsed.data.results?.[0]
      if (firstResult === undefined) {
        return { kind: "ok", value: { kind: "not_found" } }
      }
      return { kind: "ok", value: toOutcome(firstResult) }
    },
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (caught) {
    if (caught instanceof SyntaxError) {
      return undefined
    }
    throw caught
  }
}
