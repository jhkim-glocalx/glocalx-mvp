import { describe, expect, it } from "vitest"

import {
  getOAuthRequestOrigin,
  resolveOAuthRedirectUri,
} from "./oauth-redirect"

describe("OAuth redirect URI resolution", () => {
  it("uses the host header before Next's parsed origin", () => {
    expect(
      getOAuthRequestOrigin({
        headers: new Headers({
          host: "127.0.0.1:3000",
        }),
        nextUrl: new URL("http://localhost:3000/api/auth/kakao/start"),
      })
    ).toBe("http://127.0.0.1:3000")
  })

  it("uses forwarded host and protocol headers when present", () => {
    expect(
      getOAuthRequestOrigin({
        headers: new Headers({
          host: "127.0.0.1:3000",
          "x-forwarded-host": "glocalx.example",
          "x-forwarded-proto": "https",
        }),
        nextUrl: new URL("http://127.0.0.1:3000/api/auth/kakao/start"),
      })
    ).toBe("https://glocalx.example")
  })

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

  it("uses the current local origin when a configured local redirect points at a different origin", () => {
    expect(
      resolveOAuthRedirectUri({
        callbackPath: "/api/auth/kakao/callback",
        configuredRedirectUri: "http://127.0.0.1:5174/api/auth/kakao/callback",
        requestOrigin: "http://127.0.0.1:3000",
      })
    ).toBe("http://127.0.0.1:3000/api/auth/kakao/callback")
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
