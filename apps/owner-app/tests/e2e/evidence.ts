import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// Specs save review evidence (screenshots, overflow dumps) as side
// artifacts. They live under the gitignored test-results/ dir — never in
// agent scratch space like .omo/, which does not exist on fresh clones.
const evidenceDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../test-results/evidence"
)

export function evidencePath(fileName: string): string {
  mkdirSync(evidenceDirectory, { recursive: true })
  return join(evidenceDirectory, fileName)
}
