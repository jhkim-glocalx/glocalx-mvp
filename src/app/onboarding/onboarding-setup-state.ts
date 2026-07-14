import { isRecord, readString } from "@/app/_components/json-value"

export type SetupState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly apiStatus: string
      readonly auditLogId: string
      readonly followUpJobId: string | undefined
      readonly kind: "ready"
      readonly message: string
    }
  | {
      readonly accountDisplayName: string
      readonly address: string
      readonly businessName: string
      readonly categoryDisplayName: string
      readonly categoryName: string
      readonly kind: "reviewRequired"
      readonly message: string
      readonly phone: string
      readonly reviewToken: string
      readonly storeCode: string
      readonly accountName: string
      readonly languageCode: string
    }
  | {
      readonly googleLocationId: string
      readonly kind: "existingLocation"
      readonly message: string
      readonly requestAdminRightsUrl: string | undefined
    }
  | {
      readonly apiStatus: string
      readonly kind: "claimRequired"
      readonly message: string
      readonly requestAdminRightsUrl: string
    }
  | { readonly kind: "googleOAuthRequired"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }

const setupReadyStatuses = [
  "CREATE_REQUESTED",
  "VERIFICATION_PENDING",
  "VERIFIED",
] as const

function isSetupReadyStatus(
  status: string
): status is (typeof setupReadyStatuses)[number] {
  return setupReadyStatuses.some((readyStatus) => readyStatus === status)
}

export function toSetupState(payload: unknown): SetupState {
  if (!isRecord(payload)) {
    return { kind: "error", message: "GBP 세팅 응답을 읽지 못했습니다." }
  }

  const status = readString(payload["status"])
  if (status === undefined) {
    return { kind: "error", message: "GBP 세팅 응답 형식이 올바르지 않습니다." }
  }

  if (status === "CLAIM_REQUIRED") {
    const requestAdminRightsUrl = readString(payload["requestAdminRightsUrl"])
    if (requestAdminRightsUrl === undefined) {
      return {
        kind: "error",
        message: "GBP 관리자 권한 요청 링크가 없습니다.",
      }
    }

    return {
      apiStatus: status,
      kind: "claimRequired",
      message:
        readString(payload["message"]) ??
        "이미 소유자가 있는 Google 비즈니스 프로필입니다.",
      requestAdminRightsUrl,
    }
  }

  if (status === "GOOGLE_OAUTH_REQUIRED") {
    return {
      kind: "googleOAuthRequired",
      message:
        readString(payload["message"]) ??
        "Google 계정을 연결하면 실제 매장 등록을 시작해요.",
    }
  }

  if (status === "REGISTRATION_REVIEW_REQUIRED") {
    const accountDisplayName = readString(payload["accountDisplayName"])
    const address = readString(payload["address"])
    const businessName = readString(payload["businessName"])
    const categoryDisplayName = readString(payload["categoryDisplayName"])
    const categoryName = readString(payload["categoryName"])
    const accountName = readString(payload["accountName"])
    const languageCode = readString(payload["languageCode"])
    const phone = readString(payload["phone"])
    const reviewToken = readString(payload["reviewToken"])
    const storeCode = readString(payload["storeCode"])
    if (
      accountDisplayName === undefined ||
      address === undefined ||
      businessName === undefined ||
      categoryDisplayName === undefined ||
      categoryName === undefined ||
      accountName === undefined ||
      languageCode === undefined ||
      phone === undefined ||
      reviewToken === undefined ||
      storeCode === undefined
    ) {
      return { kind: "error", message: "GBP 등록 검토 정보를 읽지 못했습니다." }
    }
    return {
      accountDisplayName,
      accountName,
      address,
      businessName,
      categoryDisplayName,
      categoryName,
      kind: "reviewRequired",
      languageCode,
      message:
        readString(payload["message"]) ?? "등록할 매장 정보를 확인해주세요.",
      phone,
      reviewToken,
      storeCode,
    }
  }

  if (status === "EXISTING_LOCATION_FOUND") {
    const googleLocationId = readString(payload["googleLocationId"])
    if (googleLocationId === undefined) {
      return { kind: "error", message: "기존 GBP 후보 정보를 읽지 못했습니다." }
    }
    return {
      googleLocationId,
      kind: "existingLocation",
      message:
        readString(payload["message"]) ??
        "기존 Google 비즈니스 프로필 후보를 찾았습니다.",
      requestAdminRightsUrl: readString(payload["requestAdminRightsUrl"]),
    }
  }

  if (
    status === "STORE_PROFILE_REQUIRED" ||
    status === "AUTH_REQUIRED" ||
    status === "BLOCKED_BY_CREDENTIALS" ||
    status === "VALIDATION_ERROR" ||
    status === "GOOGLE_API_ERROR"
  ) {
    return {
      kind: "error",
      message:
        readString(payload["message"]) ?? "GBP 세팅을 진행할 수 없습니다.",
    }
  }

  if (!isSetupReadyStatus(status)) {
    return { kind: "error", message: "GBP 세팅 응답 형식이 올바르지 않습니다." }
  }

  const auditLogId = readString(payload["auditLogId"])
  if (auditLogId === undefined) {
    return {
      kind: "error",
      message: "GBP 세팅 응답에 감사 기록이 없습니다.",
    }
  }

  return {
    apiStatus: status,
    auditLogId,
    followUpJobId: readString(payload["followUpJobId"]),
    kind: "ready",
    message:
      readString(payload["message"]) ??
      "GBP 세팅 상태를 확인했어요. 대시보드에서 다음 작업을 이어갈 수 있어요.",
  }
}
