export const googleOAuthStateCookieName = "glocalx_google_oauth_state"
// Route handlers set and expire this short-lived cookie to bind the callback to the owner who started OAuth.
export const googleOAuthStateCookieOptions = {
  httpOnly: true,
  maxAge: 60 * 10,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const
export const expiredGoogleOAuthStateCookieOptions = {
  ...googleOAuthStateCookieOptions,
  maxAge: 0,
} as const

export type GoogleOAuthCallbackParams = {
  readonly code: string
  readonly expectedState: string
  readonly state: string
}

export function isValidGoogleOAuthCallback(
  options: GoogleOAuthCallbackParams
): boolean {
  return (
    options.code.trim() !== "" &&
    options.state.trim() !== "" &&
    options.expectedState.trim() !== "" &&
    options.state === options.expectedState
  )
}
