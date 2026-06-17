import { isRecord, readString } from "@/app/_components/json-value"

export type DraftState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly draftId: string
      readonly kind: "ready"
      readonly koreanCopy: string
    }
  | { readonly kind: "error"; readonly message: string }

export type PublishState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "published"; readonly message: string }
  | { readonly kind: "blocked"; readonly message: string }

export function parseDraftState(payload: unknown): DraftState {
  if (!isRecord(payload)) {
    return { kind: "error", message: "초안 응답을 읽지 못했습니다." }
  }

  const status = readString(payload["status"])
  if (status !== "DRAFT_READY") {
    return {
      kind: "error",
      message:
        readString(payload["message"]) ?? "초안 생성이 완료되지 않았습니다.",
    }
  }

  const draftId = readString(payload["draftId"])
  if (draftId === undefined) {
    return { kind: "error", message: "초안 식별자가 없습니다." }
  }

  const preview = payload["preview"]
  if (!isRecord(preview)) {
    return { kind: "error", message: "초안 미리보기가 없습니다." }
  }

  const koreanCopy = readString(preview["koreanCopy"])
  if (koreanCopy === undefined) {
    return { kind: "error", message: "초안 문구가 없습니다." }
  }

  return {
    draftId,
    kind: "ready",
    koreanCopy,
  }
}

export function parsePublishState(payload: unknown): PublishState {
  if (!isRecord(payload)) {
    return { kind: "blocked", message: "게시 응답을 읽지 못했습니다." }
  }

  const status = readString(payload["status"])
  if (status === "PUBLISHED") {
    return { kind: "published", message: "게시 완료" }
  }

  return {
    kind: "blocked",
    message:
      readString(payload["message"]) ??
      "Google 비즈니스 프로필 상태를 확인해주세요.",
  }
}
