import { randomUUID } from "node:crypto"

import type { NextRequest } from "next/server"

import { decodeMessageCursor } from "@glocalx/db/support/cursor"
import { csMessageCreateRequestSchema } from "@glocalx/domain/support/contracts"
import type {
  CsMessageContext,
  OwnerFacingMessage,
} from "@glocalx/domain/support/contracts"
import {
  parseJsonRoutePayload,
  rateLimitedResponse,
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"
import type { QueryableRouteDatabaseContext } from "@/server/http"

// Per-store send throttle, reusing the v1 auth-rate-limit table (architecture
// §7). Generous enough for a real conversation, tight enough to blunt abuse.
const csMessageMaxPerMinute = 20
const csMessageWindowSeconds = 60

function csMessageRateLimitRules(storeId: string) {
  return [
    {
      id: `cs_message:${storeId}`,
      maximumAttempts: csMessageMaxPerMinute,
      windowSeconds: csMessageWindowSeconds,
    },
  ]
}

// GET is a polling endpoint: never mark-read here (that is an explicit action
// when the owner opens the panel), so a closed-widget badge poll stays
// read-only.
export async function GET(request: NextRequest) {
  return withQueryableRouteDatabase(async (context) => {
    const session = await readDatabaseSession(request, context.sessionStore)
    if (session === undefined) {
      return requiredSessionResponse()
    }

    const conversation =
      await context.csConversationStore.getOpenConversationForStore(
        session.storeId
      )
    if (conversation === undefined) {
      return Response.json({
        conversation: null,
        messages: [],
        nextCursor: null,
        unreadCount: 0,
      })
    }

    const rawCursor = request.nextUrl.searchParams.get("after")
    const after =
      rawCursor === null ? undefined : decodeMessageCursor(rawCursor)
    const page = await context.csMessageStore.listOwnerMessages({
      conversationId: conversation.id,
      after,
    })
    const unreadCount = await context.csMessageStore.countUnreadForOwner(
      conversation.id
    )

    return Response.json({
      conversation: { mode: conversation.mode, status: conversation.status },
      messages: page.messages,
      nextCursor: page.nextCursor,
      unreadCount,
    })
  })
}

export async function POST(request: NextRequest) {
  return withQueryableRouteDatabase(async (context) => {
    const session = await readDatabaseSession(request, context.sessionStore)
    if (session === undefined) {
      return requiredSessionResponse()
    }

    const parsed = await parseJsonRoutePayload(
      request,
      csMessageCreateRequestSchema
    )
    if (parsed.kind === "response") {
      return parsed.response
    }

    const rateLimit = await context.authRateLimitRepository.consume(
      csMessageRateLimitRules(session.storeId)
    )
    if (rateLimit.kind === "blocked") {
      return rateLimitedResponse(rateLimit.retryAfterSeconds)
    }

    const message = await createOwnerMessage({
      context,
      storeId: session.storeId,
      body: parsed.value.body,
      messageContext: parsed.value.context,
    })
    return Response.json({ message }, { status: 201 })
  })
}

async function createOwnerMessage(input: {
  readonly context: QueryableRouteDatabaseContext
  readonly storeId: string
  readonly body: string
  readonly messageContext: CsMessageContext
}): Promise<OwnerFacingMessage> {
  const { context } = input
  const now = new Date()
  // Phase 1 conversations open in "human" mode — an operator replies from the
  // dashboard. AI mode arrives in Phase 2.
  const conversation =
    await context.csConversationStore.getOrCreateOpenConversation({
      id: randomUUID(),
      storeId: input.storeId,
      mode: "human",
      now,
    })

  const appended = await context.csMessageStore.appendMessage({
    id: randomUUID(),
    conversationId: conversation.id,
    sender: "owner",
    authorKind: "user",
    authorAdminId: null,
    body: input.body,
    now,
  })

  await context.csMessageContextStore.attachContext({
    id: randomUUID(),
    messageId: appended.id,
    context: input.messageContext,
    capturedAt: now,
  })

  // Bump the conversation so it sorts to the top of the operator inbox.
  await context.csConversationStore.touch(conversation.id, now)

  return {
    id: appended.id,
    sender: appended.sender,
    body: appended.body,
    createdAt: appended.createdAt,
  }
}
