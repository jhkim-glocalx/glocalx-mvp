export type OAuthRedirectOptions = {
  readonly callbackPath: string
  readonly configuredRedirectUri: string | undefined
  readonly requestOrigin: string
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0"
  )
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
      isLoopbackHost(requestOrigin.hostname)
    ) {
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
