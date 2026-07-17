import {
  runProviderAwareDatabaseCli,
  seedDatabaseForProvider,
} from "../src/server/db/reset-seed.ts"

await runProviderAwareDatabaseCli(seedDatabaseForProvider)
