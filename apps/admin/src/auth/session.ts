export const adminSessionCookieName = "glocalx_admin_session"
// Mirrors the owner session design (opaque DB-backed id, 7-day expiry) but a
// leaked owner cookie can never resolve here: different name, different table.
export const adminSessionMaxAgeSeconds = 60 * 60 * 24 * 7

export const adminSessionCookieOptions = {
  httpOnly: true,
  maxAge: adminSessionMaxAgeSeconds,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const

export const adminRoles = ["OPERATOR", "OWNER"] as const
export type AdminRole = (typeof adminRoles)[number]

export type AdminSession = {
  readonly adminUserId: string
  readonly displayName: string
  readonly email: string
  readonly role: AdminRole
}
