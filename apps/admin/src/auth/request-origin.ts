// Same-origin form-post guard, mirroring the owner app's
// src/auth/request-origin.ts (proxy-aware via x-forwarded-* headers).
export type OriginCheckedRequest = {
  readonly headers: Headers
  readonly nextUrl: URL
}

function firstHeaderValue(value: string | null): string | undefined {
  const firstValue = value?.split(",")[0]?.trim()
  return firstValue || undefined
}

function getRequestOrigin(request: OriginCheckedRequest): string {
  const forwardedHost = firstHeaderValue(
    request.headers.get("x-forwarded-host")
  )
  const host = forwardedHost ?? firstHeaderValue(request.headers.get("host"))
  if (host === undefined) {
    return request.nextUrl.origin
  }

  const forwardedProtocol = firstHeaderValue(
    request.headers.get("x-forwarded-proto")
  )
  const protocol =
    forwardedProtocol ?? request.nextUrl.protocol.replace(/:$/, "")
  return `${protocol}://${host}`
}

export function hasSameRequestOrigin(request: OriginCheckedRequest): boolean {
  const origin = request.headers.get("origin")
  if (origin === null) {
    return false
  }

  try {
    return new URL(origin).origin === new URL(getRequestOrigin(request)).origin
  } catch {
    return false
  }
}
