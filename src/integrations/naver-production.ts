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

const naverEnvVars = ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"] as const
const naverLocalSearchUrl = "https://openapi.naver.com/v1/search/local.json"

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

function stripNaverMarkup(value: string): string {
  return value.replaceAll(/<\/?b>/g, "").trim()
}

function optionalNonEmptyString(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim()
  return trimmedValue ? trimmedValue : undefined
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
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return new NaverSearchUnavailableError("TIMEOUT")
  }

  return new NaverSearchUnavailableError("NETWORK_ERROR")
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
