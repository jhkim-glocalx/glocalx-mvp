import { describe, expect, it } from "vitest"

import { getIntegrationRuntimeDiagnostics } from "./runtime-diagnostics"

describe("getIntegrationRuntimeDiagnostics", () => {
  it("reports stub mode without exposing secret values", () => {
    const diagnostics = getIntegrationRuntimeDiagnostics({})

    expect(diagnostics).toMatchObject({
      adapterMode: "stub",
      appIntegrationMode: {
        configured: false,
        length: 0,
        placeholder: false,
        recognizedValue: "missing",
      },
      missingNaverEnvVars: ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"],
      selectedNaverSearch: "stub-mode",
    })
  })

  it("reports preview fallback when production mode lacks Naver credentials", () => {
    const diagnostics = getIntegrationRuntimeDiagnostics({
      APP_INTEGRATION_MODE: "production",
      VERCEL_ENV: "preview",
    })

    expect(diagnostics.adapterMode).toBe("production")
    expect(diagnostics.selectedNaverSearch).toBe(
      "stub-preview-missing-credentials"
    )
    expect(diagnostics.missingNaverEnvVars).toEqual([
      "NAVER_CLIENT_ID",
      "NAVER_CLIENT_SECRET",
    ])
  })

  it("reports production Naver search when credentials are configured", () => {
    const diagnostics = getIntegrationRuntimeDiagnostics({
      APP_INTEGRATION_MODE: "production",
      NAVER_CLIENT_ID: "test-client-id",
      NAVER_CLIENT_SECRET: "test-client-secret",
      VERCEL_ENV: "preview",
    })

    expect(diagnostics.selectedNaverSearch).toBe("production")
    expect(diagnostics.missingNaverEnvVars).toEqual([])
    expect(diagnostics.naverCredentials.NAVER_CLIENT_ID).toEqual({
      configured: true,
      length: 14,
      placeholder: false,
    })
    expect(JSON.stringify(diagnostics)).not.toContain("test-client-id")
    expect(JSON.stringify(diagnostics)).not.toContain("test-client-secret")
  })
})
