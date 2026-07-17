import { vi } from "vitest"

const draftResponse = {
  draftId: "draft-original",
  preview: {
    koreanCopy: "이번 주말 브런치 신메뉴를 만나보세요.",
    platformPreviews: [
      {
        copy: "이번 주말 브런치 신메뉴를 만나보세요.",
        platform: "GBP",
      },
    ],
    suggestion: {
      id: "suggestion-1",
      message: "일본 관광객 타겟 문구를 더해보세요.",
      rationale: "최근 방문 비중이 높습니다.",
      revisedIntent: "일본 관광객에게 브런치 신메뉴 홍보",
      title: "타겟 문구 강화",
    },
  },
  status: "DRAFT_READY",
} as const

const revisedDraftResponse = {
  draftId: "draft-revised",
  preview: {
    koreanCopy: "일본 관광객에게 이번 주말 브런치 신메뉴를 소개합니다.",
    platformPreviews: [
      {
        copy: "일본 관광객에게 이번 주말 브런치 신메뉴를 소개합니다.",
        platform: "GBP",
      },
    ],
    suggestion: null,
  },
  status: "DRAFT_READY",
} as const

const postingDecisionResponse = {
  assistantMessage: "제안을 반영해 게시물 초안을 다시 만들었어요.",
  decision: "accepted",
  draft: revisedDraftResponse,
  revisedIntent: "일본 관광객에게 브런치 신메뉴 홍보",
  sessionId: "posting-session-1",
  status: "POSTING_CONVERSATION_TURN",
} as const

export const twentyMbBytes = 20_000_000

export function fileInputFrom(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected a file input in the photo workflow.")
  }

  return input
}

export function hasField(value: unknown, field: string): boolean {
  return isRecord(value) && field in value
}

export function installPostingFetch(options?: {
  readonly onDraftRequest?: (payload: unknown) => void
}): void {
  const fetchMock: typeof fetch = async (input, init) => {
    const path = pathFromRequest(input)
    if (path === "/api/posts/drafts") {
      options?.onDraftRequest?.(readJsonRequestBody(init))
      return Response.json(draftResponse)
    }

    if (path === "/api/posts/conversation/decision") {
      return Response.json(postingDecisionResponse)
    }

    return Response.json(
      { message: `Unexpected request: ${path}`, status: "UNEXPECTED_REQUEST" },
      { status: 500 }
    )
  }

  vi.stubGlobal("fetch", fetchMock)
  vi.spyOn(window.crypto, "randomUUID").mockReturnValue("client-event-1")
}

export function readImageAssets(payload: unknown): readonly unknown[] {
  if (!isRecord(payload) || !Array.isArray(payload["imageAssets"])) {
    throw new Error("Expected request payload with imageAssets.")
  }

  return payload["imageAssets"]
}

export function readNumberField(value: unknown, field: string): number {
  if (!isRecord(value)) {
    throw new Error(`Expected ${field} to be read from an object.`)
  }

  const fieldValue = value[field]
  if (typeof fieldValue !== "number") {
    throw new Error(`Expected ${field} to be a number.`)
  }

  return fieldValue
}

export function readStringField(value: unknown, field: string): string {
  if (!isRecord(value)) {
    throw new Error(`Expected ${field} to be read from an object.`)
  }

  const fieldValue = value[field]
  if (typeof fieldValue !== "string") {
    throw new Error(`Expected ${field} to be a string.`)
  }

  return fieldValue
}

export function sizedImageFile(options: {
  readonly name: string
  readonly sizeBytes: number
  readonly type: "image/jpeg" | "image/png" | "image/webp"
}): File {
  const file = new File(["image"], options.name, {
    lastModified: options.sizeBytes,
    type: options.type,
  })
  Object.defineProperty(file, "size", { value: options.sizeBytes })
  return file
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function pathFromRequest(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input
  }

  if (input instanceof URL) {
    return input.pathname
  }

  return input.url
}

function readJsonRequestBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") {
    throw new Error("Expected a JSON request body.")
  }

  const payload: unknown = JSON.parse(init.body)
  return payload
}
