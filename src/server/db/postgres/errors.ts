export class DatabaseUrlDirectConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DatabaseUrlDirectConfigurationError"
  }
}

export class PostgresMigrationChecksumError extends Error {
  constructor(version: string) {
    super(
      `Postgres migration ${version} was already applied with a different checksum`
    )
    this.name = "PostgresMigrationChecksumError"
  }
}

export class PostgresSchemaVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PostgresSchemaVerificationError"
  }
}
