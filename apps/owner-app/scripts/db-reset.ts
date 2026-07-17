import {
  resetDatabaseForProvider,
  runProviderAwareDatabaseCli,
} from "@glocalx/db/reset-seed"

await runProviderAwareDatabaseCli(resetDatabaseForProvider)
