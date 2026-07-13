type DatabaseEnvironment = Readonly<Record<string, string | undefined>>

export class ProductionDatabaseResetError extends Error {
  readonly name = "ProductionDatabaseResetError"
}

export function assertPostgresResetAllowed(env: DatabaseEnvironment): void {
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
}
