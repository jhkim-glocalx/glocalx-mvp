import { getOAuthRequestOrigin } from "./oauth-redirect"

export type OriginCheckedRequest = {
  readonly headers: Headers
  readonly nextUrl: URL
}

export function hasSameRequestOrigin(request: OriginCheckedRequest): boolean {
  const origin = request.headers.get("origin")
  if (origin === null) {
    return false
  }

  try {
    return (
      new URL(origin).origin === new URL(getOAuthRequestOrigin(request)).origin
    )
  } catch {
    return false
  }
}
