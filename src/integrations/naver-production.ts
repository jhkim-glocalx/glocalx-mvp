import { Buffer } from "node:buffer"

import { z } from "zod"

import type { AdapterBusinessProfileCandidate } from "@/domain/schemas"

import { blockedByCredentials, missingEnvVars } from "./credentials"
import type {
  AdapterEnvironment,
  AdapterResult,
  ExternalFetch,
  HttpRequestSpec,
  NaverSearchAdapter,
  NaverSearchInput,
  NaverSearchResult,
} from "./contracts"
import { NaverSearchUnavailableError } from "./contracts"

export const naverEnvVars = ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"] as const
const naverLocalSearchUrl = "https://openapi.naver.com/v1/search/local.json"
const naverPlaceDetailBaseUrl = "https://pcmap.place.naver.com/place"
const naverPlaceFetchHeaders = {
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
} as const

const naverLocalItemSchema = z
  .object({
    title: z.string(),
    link: z.string().optional(),
    category: z.string(),
    telephone: z.string().optional(),
    address: z.string(),
    roadAddress: z.string().optional(),
    mapx: z.coerce.number().optional(),
    mapy: z.coerce.number().optional(),
  })
  .passthrough()

const naverLocalResponseSchema = z
  .object({
    items: z.array(naverLocalItemSchema),
  })
  .passthrough()

type NaverPlaceDetail = {
  readonly name: string
  readonly address: string
  readonly category: string
  readonly phone?: string
  readonly hours?: string
}

function stripNaverMarkup(value: string): string {
  return value.replaceAll(/<\/?b>/g, "").trim()
}

function optionalNonEmptyString(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim()
  return trimmedValue ? trimmedValue : undefined
}

function hasReadableText(value: string): boolean {
  return /[A-Za-z가-힣]/u.test(value)
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value)
  } catch (error) {
    if (error instanceof TypeError) {
      return undefined
    }
    throw error
  }
}

function isNaverHost(hostname: string): boolean {
  return hostname === "naver.me" || hostname.endsWith(".naver.com")
}

function safelyDecodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function extractNaverPlaceIdFromUrl(url: URL): string | undefined {
  const decodedPathname = safelyDecodeUriComponent(url.pathname)
  const pathPlaceMatch = /(?:^|\/)(?:entry\/)?place\/(\d+)(?:\/|$)/u.exec(
    decodedPathname
  )
  if (pathPlaceMatch?.[1] !== undefined) {
    return pathPlaceMatch[1]
  }

  if (url.hostname.endsWith(".place.naver.com")) {
    const placeHostMatch = /(?:^|\/)[^/]+\/(\d+)(?:\/|$)/u.exec(decodedPathname)
    return placeHostMatch?.[1]
  }

  return undefined
}

function extractNaverPlaceIdFromText(value: string): string | undefined {
  const decodedValue = safelyDecodeUriComponent(value)
  const placeMatch =
    /(?:\/(?:entry\/)?place\/|\/(?:restaurant|hospital|hairshop|accommodation|attraction)\/)(\d+)(?:[/?#"]|$)/u.exec(
      decodedValue
    )
  return placeMatch?.[1]
}

function buildNaverPlaceDetailUrl(placeId: string): string {
  return `${naverPlaceDetailBaseUrl}/${placeId}/home`
}

function candidateIdFromParts(parts: readonly string[]): string {
  const encoded = Buffer.from(parts.join(":"))
    .toString("base64url")
    .slice(0, 24)
  return `naver-local-${encoded}`
}

function normalizeNaverLocalItem(
  item: z.infer<typeof naverLocalItemSchema>,
  input: NaverSearchInput
): AdapterBusinessProfileCandidate {
  const name = stripNaverMarkup(item.title)
  const address = optionalNonEmptyString(item.roadAddress) ?? item.address
  const phone = optionalNonEmptyString(item.telephone)
  const naverPlaceUrl = optionalNonEmptyString(item.link)
  const coordinates =
    item.mapx === undefined || item.mapy === undefined
      ? undefined
      : {
          mapx: item.mapx,
          mapy: item.mapy,
        }

  return {
    candidateId: candidateIdFromParts([input.query, name, address]),
    source: "NAVER_LOCAL",
    sourceInput: input.rawInput ?? input.query,
    name,
    address,
    category: stripNaverMarkup(item.category),
    ...(phone === undefined ? {} : { phone }),
    ...(naverPlaceUrl === undefined ? {} : { naverPlaceUrl }),
    ...(coordinates === undefined ? {} : { coordinates }),
    missingFields: phone === undefined ? ["phone", "hours"] : ["hours"],
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
}

function cleanExtractedString(value: string): string | undefined {
  const cleanedValue = decodeHtmlEntities(value).replaceAll(/\s+/gu, " ").trim()
  return cleanedValue === "" ? undefined : cleanedValue
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function collectReadableStrings(
  value: unknown,
  depth = 0,
  requireReadableText = true
): readonly string[] {
  if (depth > 3) {
    return []
  }

  if (typeof value === "string") {
    const cleanedValue = cleanExtractedString(value)
    return cleanedValue === undefined ||
      (requireReadableText && !hasReadableText(cleanedValue))
      ? []
      : [cleanedValue]
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectReadableStrings(item, depth + 1, requireReadableText)
    )
  }

  if (isRecord(value)) {
    return Object.values(value).flatMap((item) =>
      collectReadableStrings(item, depth + 1, requireReadableText)
    )
  }

  return []
}

function readStringFromKnownKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  options: { readonly requireReadableText?: boolean } = {}
): string | undefined {
  for (const key of keys) {
    const readableValue = collectReadableStrings(
      record[key],
      0,
      options.requireReadableText ?? true
    )[0]
    if (readableValue !== undefined) {
      return readableValue
    }
  }
  return undefined
}

function extractBalancedJsonObject(
  value: string,
  marker: string
): string | undefined {
  const markerIndex = value.indexOf(marker)
  if (markerIndex === -1) {
    return undefined
  }

  const objectStart = value.indexOf("{", markerIndex)
  if (objectStart === -1) {
    return undefined
  }

  let depth = 0
  let escaped = false
  let inString = false

  for (let index = objectStart; index < value.length; index += 1) {
    const character = value[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (character === "\\") {
      escaped = true
      continue
    }

    if (character === '"') {
      inString = !inString
      continue
    }

    if (inString) {
      continue
    }

    if (character === "{") {
      depth += 1
    } else if (character === "}") {
      depth -= 1
      if (depth === 0) {
        return value.slice(objectStart, index + 1)
      }
    }
  }

  return undefined
}

function parseNaverApolloState(html: string): unknown | undefined {
  const jsonValue = extractBalancedJsonObject(html, "__APOLLO_STATE__")
  if (jsonValue === undefined) {
    return undefined
  }

  try {
    return JSON.parse(jsonValue)
  } catch {
    return undefined
  }
}

const naverPlaceNameKeys = [
  "name",
  "businessName",
  "displayName",
  "placeName",
  "title",
] as const
const naverPlaceRoadAddressKeys = [
  "roadAddress",
  "roadAddr",
  "fullRoadAddress",
] as const
const naverPlaceAddressKeys = [
  "address",
  "jibunAddress",
  "addr",
  "fullAddress",
] as const
const naverPlaceCategoryKeys = [
  "category",
  "categoryName",
  "categoryLabel",
  "categoryText",
  "bizCategoryName",
] as const
const naverPlacePhoneKeys = [
  "phone",
  "telephone",
  "tel",
  "phoneNumber",
  "virtualPhone",
] as const
const naverPlaceHoursKeys = [
  "businessHours",
  "hours",
  "openingHours",
  "operationHours",
  "bizhourInfo",
] as const

function scorePlaceDetail(detail: NaverPlaceDetail): number {
  return (
    3 +
    (detail.phone === undefined ? 0 : 1) +
    (detail.hours === undefined ? 0 : 1)
  )
}

function detailFromRecord(
  record: Readonly<Record<string, unknown>>
): NaverPlaceDetail | undefined {
  const name = readStringFromKnownKeys(record, naverPlaceNameKeys)
  const address =
    readStringFromKnownKeys(record, naverPlaceRoadAddressKeys) ??
    readStringFromKnownKeys(record, naverPlaceAddressKeys)
  const category = readStringFromKnownKeys(record, naverPlaceCategoryKeys)

  if (name === undefined || address === undefined || category === undefined) {
    return undefined
  }

  const phone = readStringFromKnownKeys(record, naverPlacePhoneKeys, {
    requireReadableText: false,
  })
  const hours = collectReadableStrings(
    naverPlaceHoursKeys.flatMap((key) => [record[key]]),
    0,
    false
  )
    .slice(0, 6)
    .join(" / ")

  return {
    name,
    address,
    category,
    ...(phone === undefined ? {} : { phone }),
    ...(hours === "" ? {} : { hours }),
  }
}

function findPlaceDetailInJson(value: unknown): NaverPlaceDetail | undefined {
  let bestDetail: NaverPlaceDetail | undefined

  function visit(node: unknown, depth = 0): void {
    if (depth > 8) {
      return
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, depth + 1)
      }
      return
    }

    if (!isRecord(node)) {
      return
    }

    const detail = detailFromRecord(node)
    if (
      detail !== undefined &&
      (bestDetail === undefined ||
        scorePlaceDetail(detail) > scorePlaceDetail(bestDetail))
    ) {
      bestDetail = detail
    }

    for (const child of Object.values(node)) {
      visit(child, depth + 1)
    }
  }

  visit(value)
  return bestDetail
}

function extractNaverPlaceDetail(html: string): NaverPlaceDetail | undefined {
  const apolloState = parseNaverApolloState(html)
  return apolloState === undefined
    ? undefined
    : findPlaceDetailInJson(apolloState)
}

function candidateFromNaverPlaceDetail(
  detail: NaverPlaceDetail,
  input: NaverSearchInput,
  placeId: string
): AdapterBusinessProfileCandidate {
  const sourceInput = input.rawInput ?? input.query
  const missingFields = [
    ...(detail.phone === undefined ? ["phone" as const] : []),
    ...(detail.hours === undefined ? ["hours" as const] : []),
  ]

  return {
    candidateId: candidateIdFromParts([
      sourceInput,
      placeId,
      detail.name,
      detail.address,
    ]),
    source: "NAVER_LOCAL",
    sourceInput,
    name: detail.name,
    address: detail.address,
    category: detail.category,
    naverPlaceUrl: `https://map.naver.com/p/entry/place/${placeId}`,
    ...(detail.phone === undefined ? {} : { phone: detail.phone }),
    ...(detail.hours === undefined ? {} : { hours: detail.hours }),
    missingFields,
  }
}

async function fetchNaverPlaceIdFromShortLink(
  rawUrl: URL,
  fetchImpl: ExternalFetch
): Promise<string | undefined> {
  if (rawUrl.hostname !== "naver.me") {
    return undefined
  }

  const response = await fetchImpl(rawUrl.toString(), {
    headers: naverPlaceFetchHeaders,
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(6000),
  })

  if (!response.ok) {
    if (response.status >= 500 || response.status === 429) {
      throw new NaverSearchUnavailableError("HTTP_ERROR", response.status)
    }
    return undefined
  }

  const responseUrl = parseUrl(response.url)
  const responseUrlPlaceId =
    responseUrl === undefined
      ? undefined
      : extractNaverPlaceIdFromUrl(responseUrl)
  if (responseUrlPlaceId !== undefined) {
    return responseUrlPlaceId
  }

  return extractNaverPlaceIdFromText(await response.text())
}

async function fetchNaverPlaceDetailCandidate(
  input: NaverSearchInput,
  fetchImpl: ExternalFetch
): Promise<AdapterBusinessProfileCandidate | undefined> {
  const rawUrl = parseUrl(input.rawInput ?? input.query)
  if (rawUrl === undefined || !isNaverHost(rawUrl.hostname)) {
    return undefined
  }

  const placeId =
    extractNaverPlaceIdFromUrl(rawUrl) ??
    (await fetchNaverPlaceIdFromShortLink(rawUrl, fetchImpl))
  if (placeId === undefined) {
    return undefined
  }

  const response = await fetchImpl(buildNaverPlaceDetailUrl(placeId), {
    headers: naverPlaceFetchHeaders,
    method: "GET",
    signal: AbortSignal.timeout(6000),
  })

  if (!response.ok) {
    if (response.status >= 500 || response.status === 429) {
      throw new NaverSearchUnavailableError("HTTP_ERROR", response.status)
    }
    return undefined
  }

  const detail = extractNaverPlaceDetail(await response.text())
  return detail === undefined
    ? undefined
    : candidateFromNaverPlaceDetail(detail, input, placeId)
}

export function buildNaverLocalSearchRequest(
  env: AdapterEnvironment,
  input: NaverSearchInput
): HttpRequestSpec {
  const url = new URL(naverLocalSearchUrl)
  url.searchParams.set("query", input.query)
  url.searchParams.set("display", String(input.display))
  url.searchParams.set("start", "1")
  url.searchParams.set("sort", "random")

  return {
    method: "GET",
    url: url.toString(),
    headers: {
      "X-Naver-Client-Id": env["NAVER_CLIENT_ID"] ?? "",
      "X-Naver-Client-Secret": env["NAVER_CLIENT_SECRET"] ?? "",
    },
  }
}

function toNaverSearchUnavailableError(
  error: unknown
): NaverSearchUnavailableError {
  if (error instanceof NaverSearchUnavailableError) {
    return error
  }

  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return new NaverSearchUnavailableError("TIMEOUT")
  }

  return new NaverSearchUnavailableError("NETWORK_ERROR")
}

function isRecoverableNaverPlaceLookupError(error: unknown): boolean {
  return (
    error instanceof NaverSearchUnavailableError ||
    (error instanceof Error &&
      (error.name === "AbortError" ||
        error.name === "TimeoutError" ||
        error.name === "TypeError"))
  )
}

export function createProductionNaverSearch(
  env: AdapterEnvironment,
  fetchImpl: ExternalFetch
): NaverSearchAdapter {
  return {
    async searchLocal(
      input
    ): Promise<AdapterResult<NaverSearchResult | HttpRequestSpec>> {
      const missing = missingEnvVars(env, naverEnvVars)
      if (missing.length > 0) {
        return blockedByCredentials(missing)
      }

      let naverPlaceCandidate: AdapterBusinessProfileCandidate | undefined
      try {
        naverPlaceCandidate = await fetchNaverPlaceDetailCandidate(
          input,
          fetchImpl
        )
      } catch (error) {
        if (!isRecoverableNaverPlaceLookupError(error)) {
          throw error
        }
      }

      if (naverPlaceCandidate !== undefined) {
        return {
          kind: "ok",
          value: {
            candidates: [naverPlaceCandidate],
          },
        }
      }

      const request = buildNaverLocalSearchRequest(env, input)
      let response: Response
      try {
        response = await fetchImpl(request.url, {
          headers: request.headers,
          method: request.method,
          signal: AbortSignal.timeout(6000),
        })
      } catch (error) {
        throw toNaverSearchUnavailableError(error)
      }

      if (!response.ok) {
        throw new NaverSearchUnavailableError("HTTP_ERROR", response.status)
      }

      const payload: unknown = await response.json()
      const parsedPayload = naverLocalResponseSchema.parse(payload)
      return {
        kind: "ok",
        value: {
          candidates: parsedPayload.items.map((item) =>
            normalizeNaverLocalItem(item, input)
          ),
        },
      }
    },
  }
}
