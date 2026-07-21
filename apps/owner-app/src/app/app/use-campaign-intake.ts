"use client"

import { useCallback, useState } from "react"

import {
  mediaStoreAllowedContentTypes,
  mediaStoreMaxFileSizeBytes,
  mediaStoreMaxFilesPerRequest,
} from "@glocalx/integrations/media-store"

import {
  createCampaignRequest,
  fetchCampaignRequests,
  registerCampaignAsset,
  requestUploadToken,
} from "./campaign-requests"
import {
  readErrorMessage,
  toCampaignRequestList,
  toCreatedCampaignRequest,
  toUploadTokenResult,
  type CampaignIntakeState,
  type CampaignRequestSummary,
} from "./campaign-model"

const genericUploadErrorMessage =
  "업로드 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요."

function validateSelectedFiles(files: readonly File[]): string | undefined {
  if (files.length === 0) {
    return "사진을 1장 이상 선택해주세요."
  }
  if (files.length > mediaStoreMaxFilesPerRequest) {
    return `사진은 최대 ${mediaStoreMaxFilesPerRequest}장까지 올릴 수 있습니다.`
  }
  for (const file of files) {
    if (!mediaStoreAllowedContentTypes.includes(file.type as never)) {
      return `허용되지 않는 파일 형식입니다: ${file.name}`
    }
    if (file.size > mediaStoreMaxFileSizeBytes) {
      return `파일 크기가 10MB를 초과했습니다: ${file.name}`
    }
  }
  return undefined
}

// Uploads go straight to Vercel Blob from the browser (never through this
// route handler's 4.5MB body cap), except in stub mode, where there is no
// real store to upload to — the upload-token route's own `mode` field tells
// the client which path to take.
async function uploadFileDirectly(
  file: File,
  token: { readonly pathname: string; readonly uploadToken: string }
): Promise<string> {
  const { put } = await import("@vercel/blob/client")
  const blob = await put(token.pathname, file, {
    access: "private",
    contentType: file.type,
    token: token.uploadToken,
  })
  return blob.url
}

export function useCampaignIntake() {
  const [brief, setBrief] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<readonly File[]>([])
  const [intake, setIntake] = useState<CampaignIntakeState>({ kind: "idle" })
  const [requests, setRequests] = useState<readonly CampaignRequestSummary[]>(
    []
  )

  // Exposed rather than run in a mount effect — like posting/onboarding, this
  // screen is one tab among many mounted unconditionally in AppWorkspace, so
  // the caller triggers the fetch from the nav-select event instead.
  const refreshRequests = useCallback(async () => {
    const payload = await fetchCampaignRequests()
    setRequests(toCampaignRequestList(payload))
  }, [])

  function handleFiles(files: FileList | null) {
    setSelectedFiles(files === null ? [] : Array.from(files))
  }

  async function submit() {
    const fileError = validateSelectedFiles(selectedFiles)
    if (brief.trim() === "") {
      setIntake({ kind: "error", message: "알리고 싶은 내용을 입력해주세요." })
      return
    }
    if (fileError !== undefined) {
      setIntake({ kind: "error", message: fileError })
      return
    }

    setIntake({ kind: "submitting" })
    try {
      const createdPayload = await createCampaignRequest(brief)
      const created = toCreatedCampaignRequest(createdPayload)
      if (created === undefined) {
        setIntake({
          kind: "error",
          message: readErrorMessage(
            createdPayload,
            "요청을 제출하지 못했습니다."
          ),
        })
        return
      }

      setIntake({
        kind: "uploading",
        uploadedCount: 0,
        totalCount: selectedFiles.length,
      })
      for (const [index, file] of selectedFiles.entries()) {
        const tokenPayload = await requestUploadToken(created.id, file)
        const token = toUploadTokenResult(tokenPayload)
        if (token === undefined) {
          setIntake({
            kind: "error",
            message: readErrorMessage(tokenPayload, genericUploadErrorMessage),
          })
          return
        }

        const blobUrl =
          token.mode === "production"
            ? await uploadFileDirectly(file, token)
            : token.blobUrl

        const registerPayload = await registerCampaignAsset(created.id, blobUrl)
        if (
          !(
            typeof registerPayload === "object" &&
            registerPayload !== null &&
            "asset" in registerPayload
          )
        ) {
          setIntake({
            kind: "error",
            message: readErrorMessage(
              registerPayload,
              genericUploadErrorMessage
            ),
          })
          return
        }

        setIntake({
          kind: "uploading",
          uploadedCount: index + 1,
          totalCount: selectedFiles.length,
        })
      }

      setIntake({ kind: "success" })
      setBrief("")
      setSelectedFiles([])
      await refreshRequests()
    } catch (caught) {
      setIntake({
        kind: "error",
        message:
          caught instanceof Error ? caught.message : genericUploadErrorMessage,
      })
    }
  }

  return {
    brief,
    handleFiles,
    intake,
    refreshRequests,
    requests,
    selectedFiles,
    setBrief,
    submit,
  }
}
