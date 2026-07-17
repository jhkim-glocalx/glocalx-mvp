export const postgresDirectUrlEnvKeys = [
  "DATABASE_URL_DIRECT",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
] as const

export type PostgresDirectUrlEnvKey = (typeof postgresDirectUrlEnvKeys)[number]
export type PostgresDirectUrlEnv =
  | Readonly<Partial<Record<PostgresDirectUrlEnvKey, string | undefined>>>
  | Readonly<Record<string, string | undefined>>

export function readConfiguredPostgresDirectUrl(
  env: PostgresDirectUrlEnv
): string | undefined {
  return postgresDirectUrlEnvKeys
    .map((key) => env[key]?.trim())
    .find((value) => value !== undefined && value !== "")
}

export function hasConfiguredPostgresDirectUrl(
  env: PostgresDirectUrlEnv
): boolean {
  return readConfiguredPostgresDirectUrl(env) !== undefined
}
