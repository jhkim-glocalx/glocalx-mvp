"use client"

import { useState } from "react"

import type { OrphanedUploadCandidate } from "@glocalx/domain/support/orphaned-uploads"

import { previewOrphanedUploads } from "./orphaned-uploads-client"

type PreviewState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly kind: "loaded"
      readonly candidates: readonly OrphanedUploadCandidate[]
      readonly totalBytes: number
    }
  | { readonly kind: "error"; readonly message: string }

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

// Dry-run only, on purpose (TODOS.md #4 first pass): this panel lists what
// the sweep WOULD delete. Deletion ships once an operator has read this
// output at least once and it matches expectations.
export function OrphanedUploadsPanel() {
  const [state, setState] = useState<PreviewState>({ kind: "idle" })

  async function handlePreview() {
    setState({ kind: "loading" })
    const result = await previewOrphanedUploads()
    setState(
      result.kind === "ok"
        ? {
            kind: "loaded",
            candidates: result.candidates,
            totalBytes: result.totalBytes,
          }
        : { kind: "error", message: result.message }
    )
  }

  return (
    <section className="ops-credentials" aria-label="고아 업로드 정리">
      <h2 className="ops-section-title">고아 업로드 정리 (미리보기)</h2>
      <p className="ops-credential-meta">
        업로드는 됐지만 등록이 완료되지 않은 채 24시간 넘게 방치된 사진을
        찾습니다. 지금은 조회만 하고 삭제는 하지 않습니다.
      </p>

      <button
        type="button"
        className="ops-primary-button"
        disabled={state.kind === "loading"}
        data-testid="orphaned-uploads-preview"
        onClick={handlePreview}
      >
        {state.kind === "loading" ? "조회 중…" : "미리보기 실행"}
      </button>

      {state.kind === "error" ? (
        <p
          className="ops-credential-error"
          data-testid="orphaned-uploads-error"
        >
          {state.message}
        </p>
      ) : null}

      {state.kind === "loaded" ? (
        <div data-testid="orphaned-uploads-result">
          <p className="ops-credential-saved">
            {state.candidates.length}개, 총 {formatBytes(state.totalBytes)}
          </p>
          {state.candidates.length === 0 ? null : (
            <ul className="ops-credential-list">
              {state.candidates.map((candidate) => (
                <li
                  key={candidate.blobUrl}
                  className="ops-credential-row"
                  data-testid="orphaned-uploads-row"
                >
                  <span className="ops-credential-name">
                    {candidate.pathname}
                  </span>
                  <span className="ops-credential-meta">
                    {formatBytes(candidate.sizeBytes)} · 업로드{" "}
                    {candidate.uploadedAt.slice(0, 16)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  )
}
