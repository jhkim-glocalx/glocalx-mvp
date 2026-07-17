import { z } from "zod"

// Message ids are random UUIDs, so the polling cursor is the composite
// (created_at, id) of the last delivered message — id breaks ties for messages
// sharing a timestamp. Opaque to clients; base64url-encoded here (server only).
export type MessageCursor = {
  readonly createdAt: string
  readonly id: string
}

const cursorTupleSchema = z.tuple([z.string(), z.string()])

export function encodeMessageCursor(cursor: MessageCursor): string {
  const payload = JSON.stringify([cursor.createdAt, cursor.id])
  return Buffer.from(payload, "utf8").toString("base64url")
}

// A malformed cursor is treated as "no cursor" (poll from the beginning)
// rather than an error, so a stale client can never wedge its own polling.
export function decodeMessageCursor(raw: string): MessageCursor | undefined {
  let decoded: string
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8")
  } catch {
    return undefined
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(decoded)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined
    }
    throw error
  }

  const result = cursorTupleSchema.safeParse(parsed)
  if (!result.success) {
    return undefined
  }
  return { createdAt: result.data[0], id: result.data[1] }
}
