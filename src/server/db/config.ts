import { z } from "zod"

import {
  readConfiguredPostgresDirectUrl as readPostgresDirectUrlCandidate,
  type PostgresDirectUrlEnvKey,
} from "./postgres/direct-url.ts"

const databaseProviderSchema = z
  .union([z.literal("sqlite"), z.literal("postgres"), z.literal("")])
  .optional()
  .transform((provider) => {
    if (provider === "" || provider === undefined) {
      return "sqlite"
    }

    return provider
  })

const databaseConfigSchema = z.object({
  DATABASE_POOL_MAX: z.string().optional(),
  DATABASE_PROVIDER: databaseProviderSchema,
  DATABASE_URL: z.string().optional(),
  DATABASE_URL_DIRECT: z.string().optional(),
  DATABASE_URL_UNPOOLED: z.string().optional(),
  POSTGRES_URL_NON_POOLING: z.string().optional(),
  VERCEL: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
})

export type DatabaseProvider = z.infer<
  typeof databaseConfigSchema
>["DATABASE_PROVIDER"]

export type SqliteDatabaseConfig = {
  readonly provider: "sqlite"
}

export type PostgresDatabaseConfig = {
  readonly poolMax: number
  readonly provider: "postgres"
  readonly runtimeUrl: string
}

export type DatabaseConfig = SqliteDatabaseConfig | PostgresDatabaseConfig

export type DatabaseConfigurationCode =
  | "DATABASE_POOL_MAX_INVALID"
  | "DATABASE_PROVIDER_UNSUPPORTED"
  | "DATABASE_URL_DIRECT_INVALID"
  | "DATABASE_URL_DIRECT_REQUIRED"
  | "DATABASE_URL_INVALID"
  | "DATABASE_URL_REQUIRED"

type DatabaseConfigurationErrorInput = {
  readonly code: DatabaseConfigurationCode
  readonly message: string
  readonly provider: string | undefined
}

export class DatabaseConfigurationError extends Error {
  readonly name = "DatabaseConfigurationError"
  readonly code: DatabaseConfigurationCode
  readonly provider: string | undefined

  constructor(input: DatabaseConfigurationErrorInput) {
    super(`${input.code}: ${input.message}`)
    this.code = input.code
    this.provider = input.provider
  }
}

const postgresProtocols = new Set(["postgres:", "postgresql:"])
const defaultPostgresPoolMax = 5

function assertNeverProvider(provider: never): never {
  throw new DatabaseConfigurationError({
    code: "DATABASE_PROVIDER_UNSUPPORTED",
    message: `Unsupported database provider: ${provider}`,
    provider,
  })
}

function parsePostgresPoolMax(rawPoolMax: string | undefined): number {
  const configuredPoolMax = rawPoolMax?.trim()
  if (configuredPoolMax === undefined || configuredPoolMax === "") {
    return defaultPostgresPoolMax
  }

  const parsedPoolMax = Number(configuredPoolMax)
  if (
    !Number.isSafeInteger(parsedPoolMax) ||
    parsedPoolMax < 1 ||
    configuredPoolMax !== String(parsedPoolMax)
  ) {
    throw new DatabaseConfigurationError({
      code: "DATABASE_POOL_MAX_INVALID",
      message: "DATABASE_POOL_MAX must be a positive integer",
      provider: "postgres",
    })
  }

  return parsedPoolMax
}

function readPostgresRuntimeUrl(rawRuntimeUrl: string | undefined): string {
  const runtimeUrl = rawRuntimeUrl?.trim()
  if (!runtimeUrl) {
    throw new DatabaseConfigurationError({
      code: "DATABASE_URL_REQUIRED",
      message: "DATABASE_URL is required for Postgres runtime mode",
      provider: "postgres",
    })
  }

  try {
    const parsedUrl = new URL(runtimeUrl)
    if (!postgresProtocols.has(parsedUrl.protocol)) {
      throw new DatabaseConfigurationError({
        code: "DATABASE_URL_INVALID",
        message: "DATABASE_URL must use a postgres:// or postgresql:// URL",
        provider: "postgres",
      })
    }
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      throw error
    }

    throw new DatabaseConfigurationError({
      code: "DATABASE_URL_INVALID",
      message: "DATABASE_URL must be a valid Postgres connection URL",
      provider: "postgres",
    })
  }

  return runtimeUrl
}

function readPostgresDirectUrl(rawDirectUrl: string | undefined): string {
  const directUrl = rawDirectUrl?.trim()
  if (!directUrl) {
    throw new DatabaseConfigurationError({
      code: "DATABASE_URL_DIRECT_REQUIRED",
      message:
        "DATABASE_URL_DIRECT, DATABASE_URL_UNPOOLED, or POSTGRES_URL_NON_POOLING is required for production-like Postgres deployments",
      provider: "postgres",
    })
  }

  try {
    const parsedUrl = new URL(directUrl)
    if (!postgresProtocols.has(parsedUrl.protocol)) {
      throw new DatabaseConfigurationError({
        code: "DATABASE_URL_DIRECT_INVALID",
        message:
          "DATABASE_URL_DIRECT must use a postgres:// or postgresql:// URL",
        provider: "postgres",
      })
    }
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      throw error
    }

    throw new DatabaseConfigurationError({
      code: "DATABASE_URL_DIRECT_INVALID",
      message: "DATABASE_URL_DIRECT must be a valid Postgres connection URL",
      provider: "postgres",
    })
  }

  return directUrl
}

function readConfiguredPostgresDirectUrl(
  env: Readonly<Partial<Record<PostgresDirectUrlEnvKey, string | undefined>>>
): string {
  const directUrl = readPostgresDirectUrlCandidate(env)

  return readPostgresDirectUrl(directUrl)
}

function isProductionLikeDeployment(
  env: Readonly<Record<string, string | undefined>>
): boolean {
  return (
    env["VERCEL"] === "1" ||
    env["VERCEL_ENV"] === "preview" ||
    env["VERCEL_ENV"] === "production"
  )
}

function rejectProductionLikeSqliteProvider(): never {
  throw new DatabaseConfigurationError({
    code: "DATABASE_PROVIDER_UNSUPPORTED",
    message:
      "Production-like deployments require DATABASE_PROVIDER=postgres; SQLite is local-only",
    provider: "sqlite",
  })
}

function rejectMissingProductionLikePostgresProvider(
  provider: string | undefined
): never {
  throw new DatabaseConfigurationError({
    code: "DATABASE_PROVIDER_UNSUPPORTED",
    message:
      "Production-like deployments require DATABASE_PROVIDER=postgres after both Postgres URLs are configured",
    provider,
  })
}

export function resolveDatabaseConfig(
  env: Readonly<Record<string, string | undefined>> = process.env
): DatabaseConfig {
  const rawProvider = env["DATABASE_PROVIDER"]?.trim()
  const parsed = databaseConfigSchema.safeParse({
    DATABASE_POOL_MAX: env["DATABASE_POOL_MAX"],
    DATABASE_PROVIDER: env["DATABASE_PROVIDER"],
    DATABASE_URL: env["DATABASE_URL"],
    DATABASE_URL_DIRECT: env["DATABASE_URL_DIRECT"],
    DATABASE_URL_UNPOOLED: env["DATABASE_URL_UNPOOLED"],
    POSTGRES_URL_NON_POOLING: env["POSTGRES_URL_NON_POOLING"],
    VERCEL: env["VERCEL"],
    VERCEL_ENV: env["VERCEL_ENV"],
  })

  if (!parsed.success) {
    throw new DatabaseConfigurationError({
      code: "DATABASE_PROVIDER_UNSUPPORTED",
      message:
        env["DATABASE_PROVIDER"] === undefined
          ? "Database provider is not configured"
          : `Unsupported database provider: ${env["DATABASE_PROVIDER"]}`,
      provider: env["DATABASE_PROVIDER"],
    })
  }

  if (isProductionLikeDeployment(parsed.data)) {
    if (rawProvider === "sqlite") {
      return rejectProductionLikeSqliteProvider()
    }

    const runtimeUrl = readPostgresRuntimeUrl(parsed.data.DATABASE_URL)
    readConfiguredPostgresDirectUrl(parsed.data)

    if (rawProvider !== "postgres") {
      return rejectMissingProductionLikePostgresProvider(rawProvider)
    }

    return {
      poolMax: parsePostgresPoolMax(parsed.data.DATABASE_POOL_MAX),
      provider: "postgres",
      runtimeUrl,
    }
  }

  switch (parsed.data.DATABASE_PROVIDER) {
    case "sqlite":
      return {
        provider: "sqlite",
      }
    case "postgres":
      return {
        poolMax: parsePostgresPoolMax(parsed.data.DATABASE_POOL_MAX),
        provider: "postgres",
        runtimeUrl: readPostgresRuntimeUrl(parsed.data.DATABASE_URL),
      }
  }

  return assertNeverProvider(parsed.data.DATABASE_PROVIDER)
}
