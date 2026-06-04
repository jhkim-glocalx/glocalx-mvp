import {
  applyMigrations,
  defaultDatabasePath,
  openDatabase,
  resetDatabaseFile,
} from "../src/server/db/sqlite.ts"

resetDatabaseFile(defaultDatabasePath)
const database = openDatabase(defaultDatabasePath)
applyMigrations(database)
database.close()

console.log(`Reset database at ${defaultDatabasePath}`)
