import { missingEnvVars } from "./credentials"
import type { AdapterEnvironment, IntegrationMode } from "./contracts"
import { naverEnvVars } from "./production"
import { blobEnvVars } from "./vercel-blob-production"

type SafeEnvValueDiagnostics = {
  readonly configured: boolean
  readonly length: number
  readonly placeholder: boolean
}

type SafeModeDiagnostics = SafeEnvValueDiagnostics & {
  readonly recognizedValue: IntegrationMode | "other" | "missing"
}

export type NaverSearchSelection =
  | "production"
  | "stub-mode"
  | "stub-preview-missing-credentials"

export type IntegrationRuntimeDiagnostics = {
  readonly adapterMode: IntegrationMode
  readonly appIntegrationMode: SafeModeDiagnostics
  readonly missingNaverEnvVars: readonly string[]
  readonly naverCredentials: Readonly<
    Record<(typeof naverEnvVars)[number], SafeEnvValueDiagnostics>
  >
  readonly nodeEnv: string | null
  readonly selectedNaverSearch: NaverSearchSelection
  readonly vercelEnv: string | null
}

function safeEnvValueDiagnostics(
  env: AdapterEnvironment,
  name: string
): SafeEnvValueDiagnostics {
  // Diagnostics expose only shape metadata so credential branch debugging never writes secrets into logs or evidence.
  const trimmedValue = env[name]?.trim() ?? ""
  return {
    configured: trimmedValue !== "",
    length: trimmedValue.length,
    placeholder: trimmedValue.startsWith("replace-with-"),
  }
}

function safeModeDiagnostics(env: AdapterEnvironment): SafeModeDiagnostics {
  const valueDiagnostics = safeEnvValueDiagnostics(env, "APP_INTEGRATION_MODE")
  const trimmedMode = env["APP_INTEGRATION_MODE"]?.trim()
  const recognizedValue =
    trimmedMode === "production" || trimmedMode === "stub"
      ? trimmedMode
      : valueDiagnostics.configured
        ? "other"
        : "missing"

  return {
    ...valueDiagnostics,
    recognizedValue,
  }
}

export function shouldUsePreviewNaverStub(env: AdapterEnvironment): boolean {
  return (
    (env["VERCEL_ENV"] === "preview" || env["VERCEL_ENV"] === "development") &&
    missingEnvVars(env, naverEnvVars).length > 0
  )
}

export function shouldUsePreviewMediaStoreStub(
  env: AdapterEnvironment
): boolean {
  return (
    (env["VERCEL_ENV"] === "preview" || env["VERCEL_ENV"] === "development") &&
    missingEnvVars(env, blobEnvVars).length > 0
  )
}

export function getIntegrationRuntimeDiagnostics(
  env: AdapterEnvironment
): IntegrationRuntimeDiagnostics {
  const adapterMode =
    env["APP_INTEGRATION_MODE"] === "production" ? "production" : "stub"
  const missingNaverEnvVars = missingEnvVars(env, naverEnvVars)
  const previewNaverStub = shouldUsePreviewNaverStub(env)
  // Keep this selection mirror aligned with createIntegrationAdapters so previews explain why Naver used a stub without leaking credentials.
  const selectedNaverSearch =
    adapterMode !== "production"
      ? "stub-mode"
      : previewNaverStub
        ? "stub-preview-missing-credentials"
        : "production"

  return {
    adapterMode,
    appIntegrationMode: safeModeDiagnostics(env),
    missingNaverEnvVars,
    naverCredentials: {
      NAVER_CLIENT_ID: safeEnvValueDiagnostics(env, "NAVER_CLIENT_ID"),
      NAVER_CLIENT_SECRET: safeEnvValueDiagnostics(env, "NAVER_CLIENT_SECRET"),
    },
    nodeEnv: env["NODE_ENV"] ?? null,
    selectedNaverSearch,
    vercelEnv: env["VERCEL_ENV"] ?? null,
  }
}
