import { describe, expect, it } from "vitest"

import { resolveOAuthRedirectUri } from "./oauth-redirect"

describe("OAuth redirect URI resolution", () => {
  it("uses the current request origin when no redirect URI is configured", () => {
    expect(
      resolveOAuthRedirectUri({
        callbackPath: "/api/auth/google/callback",
        configuredRedirectUri: undefined,
        requestOrigin: "https://glocalx-mvp-tawny.vercel.app",
      })
    ).toBe("https://glocalx-mvp-tawny.vercel.app/api/auth/google/callback")
  })

  it("ignores a local redirect URI on a deployed request origin", () => {
    expect(
      resolveOAuthRedirectUri({
        callbackPath: "/api/auth/google/callback",
        configuredRedirectUri: "http://127.0.0.1:5174/api/auth/google/callback",
        requestOrigin: "https://glocalx-mvp-tawny.vercel.app",
      })
    ).toBe("https://glocalx-mvp-tawny.vercel.app/api/auth/google/callback")
  })

  it("uses a configured redirect URI only when it matches the request origin", () => {
    expect(
      resolveOAuthRedirectUri({
        callbackPath: "/api/auth/kakao/callback",
        configuredRedirectUri:
          "https://glocalx-mvp-tawny.vercel.app/api/auth/kakao/callback",
        requestOrigin: "https://glocalx-mvp-tawny.vercel.app",
      })
    ).toBe("https://glocalx-mvp-tawny.vercel.app/api/auth/kakao/callback")
  })

  it("allows configured local redirects when the request origin is also local", () => {
    expect(
      resolveOAuthRedirectUri({
        callbackPath: "/api/auth/kakao/callback",
        configuredRedirectUri: "http://127.0.0.1:5174/api/auth/kakao/callback",
        requestOrigin: "http://localhost:5174",
      })
    ).toBe("http://127.0.0.1:5174/api/auth/kakao/callback")
  })

  it("does not redirect across deployed origins because OAuth state cookies are host-bound", () => {
    expect(
      resolveOAuthRedirectUri({
        callbackPath: "/api/auth/google/callback",
        configuredRedirectUri:
          "https://glocalx-mvp-tawny.vercel.app/api/auth/google/callback",
        requestOrigin: "https://glocalx-mvp-git-dev-smokedindia.vercel.app",
      })
    ).toBe(
      "https://glocalx-mvp-git-dev-smokedindia.vercel.app/api/auth/google/callback"
    )
  })
})
