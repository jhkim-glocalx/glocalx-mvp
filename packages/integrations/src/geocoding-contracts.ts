import type { AdapterResult } from "./contracts"

export type GeocodeAddressInput = {
  readonly address: string
}

// The address components Google Business Profile's locations.create requires
// (administrativeArea + locality + postalCode) plus the pin-drop coordinates,
// resolved from a free-form Korean road address.
export type GeocodedAddress = {
  readonly administrativeArea: string
  readonly locality: string
  readonly sublocality?: string
  readonly postalCode: string
  readonly latitude: number
  readonly longitude: number
  readonly formattedAddress: string
}

export type GeocodeUpstreamReason =
  | "REQUEST_DENIED"
  | "OVER_QUERY_LIMIT"
  | "INVALID_REQUEST"
  | "HTTP_ERROR"
  | "NETWORK_ERROR"
  | "MALFORMED_RESPONSE"

export type GeocodeOutcome =
  | { readonly kind: "resolved"; readonly address: GeocodedAddress }
  // Google answered but the match is missing a GBP-required component (most
  // often postalCode), so the caller cannot build a valid location body.
  | {
      readonly kind: "incomplete"
      readonly missingComponents: readonly string[]
    }
  | { readonly kind: "not_found" }
  | { readonly kind: "upstream_error"; readonly reason: GeocodeUpstreamReason }

export interface GeocodingAdapter {
  geocodeAddress(
    input: GeocodeAddressInput
  ): Promise<AdapterResult<GeocodeOutcome>>
}
