import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import { describe, expect, it } from "vitest"

const execFileAsync = promisify(execFile)

describe("database CLI entrypoints", () => {
  it("runs SQLite reset through the package-supported Node command", async () => {
    // Given: an isolated SQLite path for the reset command.
    const directory = await mkdtemp(join(tmpdir(), "glocalx-db-cli-"))

    try {
      // When: Node executes the same entrypoint exposed by npm scripts.
      const result = await execFileAsync(
        process.execPath,
        ["scripts/db-reset.ts"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_PROVIDER: "sqlite",
            GLOCALX_DB_PATH: join(directory, "cli.db"),
          },
        }
      )

      // Then: module resolution succeeds and the command completes normally.
      expect(result.stderr).toBe("")
      expect(result.stdout).toContain("Completed sqlite database operation")
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})
