import type { OrphanedUploadCandidate } from "@glocalx/domain/support/orphaned-uploads"

// Fetch helper for the orphaned-uploads panel (mirrors org-credentials-client.ts).

const orphanedUploadsUrl = "/api/settings/orphaned-uploads"

export type PreviewOrphanedUploadsResult =
  | {
      readonly kind: "ok"
      readonly candidates: readonly OrphanedUploadCandidate[]
      readonly totalBytes: number
    }
  | { readonly kind: "error"; readonly message: string }

export async function previewOrphanedUploads(): Promise<PreviewOrphanedUploadsResult> {
  let response: Response
  try {
    response = await fetch(orphanedUploadsUrl)
  } catch {
    return { kind: "error", message: "요청을 보낼 수 없습니다." }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return {
      kind: "error",
      message: "서버가 해석할 수 없는 응답을 반환했습니다.",
    }
  }

  if (
    response.ok &&
    typeof payload === "object" &&
    payload !== null &&
    "candidates" in payload &&
    "totalBytes" in payload
  ) {
    const typed = payload as {
      candidates: readonly OrphanedUploadCandidate[]
      totalBytes: number
    }
    return {
      kind: "ok",
      candidates: typed.candidates,
      totalBytes: typed.totalBytes,
    }
  }

  if (
    response.status === 503 &&
    typeof payload === "object" &&
    payload !== null &&
    "missingEnvVars" in payload
  ) {
    const missing = (payload as { missingEnvVars: readonly string[] })
      .missingEnvVars
    return {
      kind: "error",
      message: `Blob 자격 증명이 없습니다: ${missing.join(", ")}`,
    }
  }

  return { kind: "error", message: "고아 업로드 목록을 불러오지 못했습니다." }
}
