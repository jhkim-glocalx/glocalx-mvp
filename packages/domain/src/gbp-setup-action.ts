import { z } from "zod"

// The admin setup-actions endpoint's action union. A discriminated union (like
// gbp-access's) even though it only has one member today: the office-hours
// design scoped launch to a single field-evidenced action (RUN_SETUP) and
// deferred the rest of the card's action list to the next customer-visit
// field notes — this shape is what lets that list grow without a route
// rewrite.
export type GbpSetupAction = { readonly type: "RUN_SETUP" }

export const gbpSetupActionRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("RUN_SETUP") }).strict(),
])
