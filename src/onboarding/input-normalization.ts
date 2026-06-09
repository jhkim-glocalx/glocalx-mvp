export type RetrievalError = {
  readonly code: "OPAQUE_NAVER_PLACE_LINK"
  readonly message: string
}

export type NormalizedInput =
  | {
      readonly kind: "query"
      readonly rawInput: string
      readonly query: string
    }
  | {
      readonly kind: "search_query_required"
      readonly rawInput: string
      readonly retrievalError: RetrievalError
    }

function parseUrl(input: string): URL | undefined {
  try {
    return new URL(input)
  } catch (error) {
    if (error instanceof TypeError) {
      return undefined
    }
    throw error
  }
}

function hasReadableText(value: string): boolean {
  return /[A-Za-z가-힣]/.test(value)
}

function isNaverHost(hostname: string): boolean {
  return hostname === "naver.me" || hostname.endsWith(".naver.com")
}

function isOpaqueNaverPlacePath(pathname: string): boolean {
  return /(?:^|\/)(?:entry\/)?place\/\d+(?:\/)?$/u.test(pathname)
}

function queryFromParams(parsedUrl: URL): string | undefined {
  const paramNames = ["query", "q", "searchQuery", "placeName", "name"] as const
  for (const paramName of paramNames) {
    const candidate = parsedUrl.searchParams.get(paramName)?.trim()
    if (candidate && hasReadableText(candidate)) {
      return candidate
    }
  }
  return undefined
}

function queryFromPath(parsedUrl: URL): string | undefined {
  const pathCandidate = parsedUrl.pathname.replace(/^\/+|\/+$/g, "")
  if (pathCandidate === "" || !hasReadableText(pathCandidate)) {
    return undefined
  }
  return pathCandidate
}

export function normalizeOnboardingInput(input: string): NormalizedInput {
  const rawInput = input.trim()
  const parsedUrl = parseUrl(rawInput)

  if (parsedUrl === undefined) {
    return {
      kind: "query",
      rawInput,
      query: rawInput,
    }
  }

  const paramQuery = queryFromParams(parsedUrl)
  if (paramQuery !== undefined) {
    return {
      kind: "query",
      rawInput,
      query: paramQuery,
    }
  }

  if (
    isNaverHost(parsedUrl.hostname) &&
    isOpaqueNaverPlacePath(parsedUrl.pathname)
  ) {
    return {
      kind: "search_query_required",
      rawInput,
      retrievalError: {
        code: "OPAQUE_NAVER_PLACE_LINK",
        message:
          "네이버 링크에서 가게 이름을 읽지 못했습니다. 가게 이름을 입력해주세요.",
      },
    }
  }

  return {
    kind: "query",
    rawInput,
    query: queryFromPath(parsedUrl) ?? parsedUrl.hostname,
  }
}
