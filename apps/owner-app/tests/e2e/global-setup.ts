import { resetE2eDatabase } from "./db-harness"

export { resetE2eDatabase } from "./db-harness"

export default async function globalSetup(): Promise<void> {
  await resetE2eDatabase()
}
