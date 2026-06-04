import {
  applyMigrations,
  openDatabase,
  resetDatabaseFile,
  seedDemoData,
} from "../../src/server/db/sqlite"

export function resetE2eDatabase(): void {
  resetDatabaseFile()
  const database = openDatabase()
  applyMigrations(database)
  seedDemoData(database)
  database.close()
}

export default function globalSetup(): void {
  resetE2eDatabase()
}
