import { z } from "zod"

export const locationStatusValues = [
  "DISCOVERED",
  "CLAIM_REQUIRED",
  "CREATE_REQUESTED",
  "VERIFICATION_PENDING",
  "VERIFIED",
  "DUPLICATE",
  "FAILED",
  "MANUAL_FOLLOW_UP",
] as const

export type LocationStatus = (typeof locationStatusValues)[number]

export const locationStatusSchema = z.enum(locationStatusValues)
