import { Buffer } from "node:buffer"

export function stableId(prefix: string, value: string): string {
  const encoded = Buffer.from(value).toString("base64url").slice(0, 24)
  return `${prefix}-${encoded}`
}
