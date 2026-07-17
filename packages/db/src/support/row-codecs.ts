import { z } from "zod"

// Postgres returns timestamptz as Date and jsonb as parsed JS values; SQLite
// returns TEXT for both. These codecs normalize either dialect's row shape.

export const timestampSchema = z
  .union([z.string(), z.date()])
  .transform((value) => (value instanceof Date ? value.toISOString() : value))

export const nullableTimestampSchema = z
  .union([z.string(), z.date(), z.null()])
  .transform((value) =>
    value instanceof Date ? value.toISOString() : value
  )

function parseJsonColumn(value: unknown): unknown {
  if (typeof value !== "string") {
    return value
  }
  try {
    return JSON.parse(value)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined
    }
    throw error
  }
}

export function jsonColumnSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema
): z.ZodPipe<z.ZodTransform<unknown, unknown>, TSchema> {
  return z.transform(parseJsonColumn).pipe(schema)
}
