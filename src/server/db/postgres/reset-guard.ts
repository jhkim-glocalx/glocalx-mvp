type DatabaseEnvironment = Readonly<Record<string, string | undefined>>

export class ProductionDatabaseResetError extends Error {
  readonly name = "ProductionDatabaseResetError"
}

function describePostgresResetTarget(databaseUrl: string): string {
  try {
    const target = new URL(databaseUrl)
    if (target.hostname === "") {
      throw new ProductionDatabaseResetError(
        "Postgres reset requires an explicit hostname in the URL."
      )
    }
    if (target.pathname === "/" || target.pathname === "") {
      throw new ProductionDatabaseResetError(
        "Postgres reset requires an explicit database name in the URL."
      )
    }
    return `${target.host}${target.pathname}`
  } catch (error) {
    if (error instanceof ProductionDatabaseResetError) {
      throw error
    }
    throw new ProductionDatabaseResetError(
      "Postgres reset requires a valid database URL."
    )
  }
}

export function assertPostgresResetAllowed(
  env: DatabaseEnvironment,
  databaseUrl: string
): void {
  const productionLike =
    env["NODE_ENV"] === "production" ||
    env["VERCEL"] === "1" ||
    env["VERCEL_ENV"] === "preview" ||
    env["VERCEL_ENV"] === "production"
  if (productionLike) {
    throw new ProductionDatabaseResetError(
      "Postgres reset is disabled in production-like environments."
    )
  }

  const target = describePostgresResetTarget(databaseUrl)
  if (env["POSTGRES_RESET_TARGET"] !== target) {
    throw new ProductionDatabaseResetError(
      `Postgres reset requires POSTGRES_RESET_TARGET=${target}.`
    )
  }
}
