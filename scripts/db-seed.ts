import {
  applyMigrations,
  defaultDatabasePath,
  openDatabase,
  seedDemoData,
} from "../src/server/db/sqlite.ts"

const database = openDatabase(defaultDatabasePath)
applyMigrations(database)
seedDemoData(database)
database.close()

console.log("Seeded deterministic demo owner and store")
