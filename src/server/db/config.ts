import { z } from "zod"

const databaseProviderSchema = z
  .union([z.literal("sqlite"), z.literal("")])
  .optional()
  .transform((provider) => {
    if (provider === "" || provider === undefined) {
      return "sqlite"
    }

    return provider
  })

const databaseConfigSchema = z.object({
  DATABASE_PROVIDER: databaseProviderSchema,
})

export type DatabaseProvider = z.infer<
  typeof databaseConfigSchema
>["DATABASE_PROVIDER"]

export type DatabaseConfig = {
  readonly provider: DatabaseProvider
}

export class DatabaseConfigurationError extends Error {
  readonly name = "DatabaseConfigurationError"

  constructor(readonly provider: string | undefined) {
    super(
      provider === undefined
        ? "Database provider is not configured"
        : `Unsupported database provider: ${provider}`
    )
  }
}

export function resolveDatabaseConfig(
  env: Readonly<Record<string, string | undefined>> = process.env
): DatabaseConfig {
  const parsed = databaseConfigSchema.safeParse({
    DATABASE_PROVIDER: env["DATABASE_PROVIDER"],
  })

  if (!parsed.success) {
    throw new DatabaseConfigurationError(env["DATABASE_PROVIDER"])
  }

  return {
    provider: parsed.data.DATABASE_PROVIDER,
  }
}
