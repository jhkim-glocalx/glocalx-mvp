export type OAuthRedirectOptions = {
  readonly callbackPath: string
  readonly configuredRedirectUri: string | undefined
  readonly requestOrigin: string
}

export type OAuthOriginRequest = {
  readonly headers: Headers
  readonly nextUrl: URL
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0"
  )
}

function firstHeaderValue(value: string | null): string | undefined {
  const firstValue = value?.split(",")[0]?.trim()
  return firstValue || undefined
}

export function getOAuthRequestOrigin(request: OAuthOriginRequest): string {
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"))
  const host = forwardedHost ?? firstHeaderValue(request.headers.get("host"))
  if (host === undefined) {
    return request.nextUrl.origin
  }

  const forwardedProtocol = firstHeaderValue(
    request.headers.get("x-forwarded-proto")
  )
  const protocol = forwardedProtocol ?? request.nextUrl.protocol.replace(/:$/, "")
  return `${protocol}://${host}`
}

export function resolveOAuthRedirectUri(options: OAuthRedirectOptions): string {
  const requestOrigin = new URL(options.requestOrigin)
  const requestOriginRedirectUri = new URL(
    options.callbackPath,
    requestOrigin
  ).toString()
  const configuredRedirectUri = options.configuredRedirectUri?.trim()

  if (!configuredRedirectUri) {
    return requestOriginRedirectUri
  }

  try {
    const configuredUrl = new URL(configuredRedirectUri)
    if (configuredUrl.origin === requestOrigin.origin) {
      return configuredUrl.toString()
    }

    if (
      isLoopbackHost(configuredUrl.hostname) &&
      !isLoopbackHost(requestOrigin.hostname)
    ) {
      return requestOriginRedirectUri
    }

    return requestOriginRedirectUri
  } catch {
    return requestOriginRedirectUri
  }
}
