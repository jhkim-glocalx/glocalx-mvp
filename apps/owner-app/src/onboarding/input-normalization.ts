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

  return {
    kind: "query",
    rawInput,
    query: queryFromPath(parsedUrl) ?? parsedUrl.hostname,
  }
}
