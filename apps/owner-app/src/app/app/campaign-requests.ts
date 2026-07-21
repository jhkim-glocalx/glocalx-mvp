import { readAppJsonResponse } from "./app-workspace-response"

const requestsUrl = "/api/campaigns/requests"

export async function fetchCampaignRequests(): Promise<unknown> {
  const response = await fetch(requestsUrl)
  return readAppJsonResponse(response, "요청 목록을 불러오지 못했습니다.")
}

export async function createCampaignRequest(brief: string): Promise<unknown> {
  const response = await fetch(requestsUrl, {
    body: JSON.stringify({ brief }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  return readAppJsonResponse(response, "요청을 제출하지 못했습니다.")
}

export async function requestUploadToken(
  requestId: string,
  file: File
): Promise<unknown> {
  const response = await fetch(`${requestsUrl}/${requestId}/upload-token`, {
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  return readAppJsonResponse(response, "업로드를 준비하지 못했습니다.")
}

export async function registerCampaignAsset(
  requestId: string,
  blobUrl: string
): Promise<unknown> {
  const response = await fetch(`${requestsUrl}/${requestId}/assets`, {
    body: JSON.stringify({ blobUrl, kind: "original" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  return readAppJsonResponse(response, "업로드한 파일을 등록하지 못했습니다.")
}
