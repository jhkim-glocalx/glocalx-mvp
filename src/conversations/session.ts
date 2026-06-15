import { z } from "zod"

import { conversationTransitionSchema } from "./states"
import {
  clientEventIdSchema,
  onboardingConversationStateSchema,
  postingConversationStateSchema,
} from "./states"

const nonEmptyStringSchema = z.string().trim().min(1)

export const conversationRoleSchema = z.enum(["owner", "assistant", "system"])

export const conversationMessageSchema = z
  .object({
    clientEventId: clientEventIdSchema.optional(),
    content: nonEmptyStringSchema,
    createdAt: nonEmptyStringSchema,
    id: nonEmptyStringSchema,
    role: conversationRoleSchema,
    sessionId: nonEmptyStringSchema,
    structuredPayload: z.unknown().optional(),
  })
  .strict()

const conversationStatusSchema = z.enum([
  "ACTIVE",
  "COMPLETED",
  "ABANDONED",
  "NEEDS_MANUAL_REVIEW",
])

const onboardingSessionSchema = z
  .object({
    conversationState: z.unknown(),
    currentState: onboardingConversationStateSchema,
    id: nonEmptyStringSchema,
    status: conversationStatusSchema,
    storeId: nonEmptyStringSchema,
    surface: z.literal("ONBOARDING"),
  })
  .strict()

const postingSessionSchema = z
  .object({
    conversationState: z.unknown(),
    currentState: postingConversationStateSchema,
    id: nonEmptyStringSchema,
    status: conversationStatusSchema,
    storeId: nonEmptyStringSchema,
    surface: z.literal("POSTING"),
  })
  .strict()

export const conversationSessionSchema = z.discriminatedUnion("surface", [
  onboardingSessionSchema,
  postingSessionSchema,
])

export const conversationTurnSchema = z
  .object({
    assistantMessage: conversationMessageSchema.optional(),
    ownerMessage: conversationMessageSchema.optional(),
    session: conversationSessionSchema,
    transition: conversationTransitionSchema,
  })
  .strict()
