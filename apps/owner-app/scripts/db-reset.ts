import {
  resetDatabaseForProvider,
  runProviderAwareDatabaseCli,
} from "../src/server/db/reset-seed.ts"

await runProviderAwareDatabaseCli(resetDatabaseForProvider)
