import {
  runProviderAwareDatabaseCli,
  seedDatabaseForProvider,
} from "@glocalx/db/reset-seed"

await runProviderAwareDatabaseCli(seedDatabaseForProvider)
