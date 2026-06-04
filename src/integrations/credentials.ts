import type { AdapterEnvironment, BlockedByCredentials } from "./contracts"

export const googleBusinessManageScope =
  "https://www.googleapis.com/auth/business.manage"

export function blockedByCredentials(
  missingEnvVars: readonly string[]
): BlockedByCredentials {
  return {
    kind: "blocked_by_credentials",
    code: "BLOCKED_BY_CREDENTIALS",
    missingEnvVars,
  }
}

export function missingEnvVars(
  env: AdapterEnvironment,
  names: readonly string[]
): readonly string[] {
  return names.filter((name) => {
    const value = env[name]
    return value === undefined || value.trim() === ""
  })
}
