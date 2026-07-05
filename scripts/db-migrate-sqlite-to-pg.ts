import {
  applyMigrations,
  openDatabase,
  resolveDefaultDatabasePath,
} from "../src/server/db/sqlite.ts"
import {
  MigrationInputError,
  collectSqliteExportSnapshot,
  readExportSnapshot,
  writeExportSnapshot,
} from "../src/server/db/sqlite-to-postgres.ts"
import {
  MigrationReconciliationError,
  formatReconciliationSummary,
  reconcileSnapshots,
} from "../src/server/db/sqlite-to-postgres-reconcile.ts"
import {
  DatabaseUrlDirectConfigurationError,
  openPostgresDatabase,
  readDatabaseUrlDirect,
} from "../src/server/db/postgres/migrations.ts"
import {
  MigrationSafetyError,
  assertSafePostgresImportTarget,
  describePostgresTarget,
  importSnapshotToPostgres,
} from "../src/server/db/postgres/sqlite-import.ts"

type CliOptions = {
  readonly confirmedNonProduction: boolean
  readonly dryRun: boolean
  readonly exportPath: string
  readonly importMode: boolean
  readonly inputPath: string | null
  readonly resetTarget: boolean
  readonly sqlitePath: string
}

const defaultExportPath = ".omo/evidence/sqlite-to-postgres-export.json"

function printHelp(): void {
  console.log(`Usage: npm run db:migrate:sqlite-to-pg -- [options]

Options:
  --dry-run                    Export SQLite and reconcile the export locally.
  --import                     Import into DATABASE_URL_DIRECT and reconcile Postgres.
  --sqlite <path>              SQLite database path. Defaults to GLOCALX_DB_PATH or .glocalx/dev.db.
  --export <path>              Export JSON path. Defaults to ${defaultExportPath}.
  --input <path>               Import an existing export JSON instead of reading SQLite.
  --reset-target               Reset Postgres public schema before import.
  --confirm-non-production     Required before any Postgres write.
  --help                       Show this help.
`)
}

function readNextArg(
  argv: readonly string[],
  index: number,
  name: string
): string {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith("--")) {
    throw new MigrationInputError(`${name} requires a value`)
  }
  return value
}

function parseCliOptions(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>
): CliOptions | null {
  if (argv.includes("--help")) {
    return null
  }
  let dryRun = true
  let importMode = false
  let exportPath = defaultExportPath
  let inputPath: string | null = null
  let resetTarget = false
  let confirmedNonProduction = false
  let sqlitePath = resolveDefaultDatabasePath(env)

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case "--dry-run":
        dryRun = true
        break
      case "--import":
        importMode = true
        dryRun = false
        break
      case "--sqlite":
        sqlitePath = readNextArg(argv, index, arg)
        index += 1
        break
      case "--export":
        exportPath = readNextArg(argv, index, arg)
        index += 1
        break
      case "--input":
        inputPath = readNextArg(argv, index, arg)
        index += 1
        break
      case "--reset-target":
        resetTarget = true
        break
      case "--confirm-non-production":
        confirmedNonProduction = true
        break
      default:
        throw new MigrationInputError(`Unknown option: ${String(arg)}`)
    }
  }

  return {
    confirmedNonProduction,
    dryRun,
    exportPath,
    importMode,
    inputPath,
    resetTarget,
    sqlitePath,
  }
}

async function runSqliteToPostgresMigrationCli(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>
): Promise<void> {
  const options = parseCliOptions(argv, env)
  if (options === null) {
    printHelp()
    return
  }

  const snapshot =
    options.inputPath === null
      ? exportCurrentSqlite(options.sqlitePath, options.exportPath)
      : readExportSnapshot(options.inputPath)

  if (options.dryRun) {
    const roundTripSnapshot = readExportSnapshot(
      options.inputPath ?? options.exportPath
    )
    const report = reconcileSnapshots(snapshot, roundTripSnapshot)
    console.log(
      `Dry-run reconciliation passed: ${formatReconciliationSummary(report)}`
    )
    console.log(
      options.inputPath === null
        ? `SQLite export written to ${options.exportPath}`
        : `SQLite export read from ${options.inputPath}`
    )
    return
  }

  if (!options.importMode) {
    throw new MigrationInputError("Choose --dry-run or --import")
  }

  const databaseUrl = readDatabaseUrlDirect(env)
  assertSafePostgresImportTarget(
    env,
    databaseUrl,
    options.confirmedNonProduction
  )
  const sql = openPostgresDatabase(databaseUrl)
  try {
    const report = await importSnapshotToPostgres(sql, snapshot, {
      resetTarget: options.resetTarget,
    })
    console.log(
      `Postgres import reconciliation passed for ${describePostgresTarget(databaseUrl)}: ${formatReconciliationSummary(report)}`
    )
  } finally {
    await sql.end()
  }
}

function exportCurrentSqlite(sqlitePath: string, exportPath: string) {
  const database = openDatabase(sqlitePath)
  try {
    applyMigrations(database)
    const snapshot = collectSqliteExportSnapshot(database)
    writeExportSnapshot(exportPath, snapshot)
    return snapshot
  } finally {
    database.close()
  }
}

try {
  await runSqliteToPostgresMigrationCli(process.argv.slice(2), process.env)
} catch (error) {
  if (
    error instanceof DatabaseUrlDirectConfigurationError ||
    error instanceof MigrationInputError ||
    error instanceof MigrationReconciliationError ||
    error instanceof MigrationSafetyError
  ) {
    console.error(`${error.name}: ${error.message}`)
    process.exitCode = 1
  } else {
    throw error
  }
}
