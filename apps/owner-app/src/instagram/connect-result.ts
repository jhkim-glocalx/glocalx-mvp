import type { InstagramConnectResult } from "./oauth-link"

const instagramConnectResults = [
  "connected",
  "connected_other_account",
  "needs_professional_account",
  "error",
] as const satisfies readonly InstagramConnectResult[]

/**
 * Read the `?instagram=` flag the connect callback redirects with.
 *
 * The value is attacker-controllable (anyone can type a URL), so it is matched
 * against the known set rather than cast — an unknown or repeated value means
 * "no connect happened", which puts the owner back in the normal chat flow.
 */
export function readInstagramConnectResult(
  value: string | readonly string[] | undefined
): InstagramConnectResult | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  return instagramConnectResults.find((result) => result === value)
}
