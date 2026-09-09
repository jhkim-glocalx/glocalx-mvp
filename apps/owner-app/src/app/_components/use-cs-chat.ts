"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type {
  ActivitySection,
  ActivityStage,
} from "@glocalx/domain/support/contracts"

import type { ActivityRecorder } from "./use-activity-trail"

export type OwnerMessage = {
  readonly id: string
  readonly sender: "owner" | "assistant"
  readonly body: string
  readonly createdAt: string
}

type ChatListResponse = {
  readonly conversation: {
    readonly mode: string
    readonly status: string
  } | null
  readonly messages: readonly OwnerMessage[]
  readonly nextCursor: string | null
  readonly unreadCount: number
}

const openPollMs = 3000
const closedPollMs = 30000

export type CsChatOptions = {
  readonly activity: ActivityRecorder
  readonly open: boolean
  readonly section: ActivitySection
  // The screen inside the section, when the section has sub-steps; it rides
  // along with each message so the operator sees where the owner is stuck.
  readonly stage?: ActivityStage | undefined
}

export type CsChat = {
  readonly messages: readonly OwnerMessage[]
  readonly unread: number
  readonly sending: boolean
  readonly send: (body: string) => Promise<boolean>
  readonly markRead: () => void
}

// The owner half of the support conversation (architecture §3), shared by every
// surface that can open it: polls the cursor endpoint — 3s open for liveness,
// 30s closed for the unread badge — so send latency never depends on an
// operator (or, in Phase 2, the AI).
export function useCsChat({
  activity,
  open,
  section,
  stage,
}: CsChatOptions): CsChat {
  const [messages, setMessages] = useState<readonly OwnerMessage[]>([])
  const [unread, setUnread] = useState(0)
  const [sending, setSending] = useState(false)
  const cursorRef = useRef<string | null>(null)
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  }, [open])

  const mergeMessages = useCallback((incoming: readonly OwnerMessage[]) => {
    if (incoming.length === 0) {
      return
    }
    setMessages((previous) => {
      const seen = new Set(previous.map((message) => message.id))
      const added = incoming.filter((message) => !seen.has(message.id))
      return added.length === 0 ? previous : [...previous, ...added]
    })
  }, [])

  const poll = useCallback(async () => {
    const cursor = cursorRef.current
    const url =
      cursor === null
        ? "/api/chat/messages"
        : `/api/chat/messages?after=${encodeURIComponent(cursor)}`
    try {
      const response = await fetch(url)
      if (!response.ok) {
        return
      }
      const data = (await response.json()) as ChatListResponse
      if (data.nextCursor !== null) {
        cursorRef.current = data.nextCursor
      }
      mergeMessages(data.messages)
      // While open the panel is being read, so the badge stays cleared.
      setUnread(openRef.current ? 0 : data.unreadCount)
    } catch {
      // Polling is best-effort; the next tick reconciles.
    }
  }, [mergeMessages])

  const markRead = useCallback(() => {
    setUnread(0)
    void (async () => {
      try {
        await fetch("/api/chat/messages/read", {
          body: "{}",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
      } catch {
        // A missed mark-read self-heals on the next open.
      }
    })()
  }, [])

  useEffect(() => {
    void poll()
    const timer = setInterval(
      () => void poll(),
      open ? openPollMs : closedPollMs
    )
    return () => clearInterval(timer)
  }, [open, poll])

  const send = useCallback(
    async (body: string): Promise<boolean> => {
      if (body.length === 0 || sending) {
        return false
      }
      setSending(true)
      try {
        const response = await fetch("/api/chat/messages", {
          body: JSON.stringify({
            body,
            context: {
              activityTrail: activity.getTrail(),
              section,
              stage: stage ?? null,
            },
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
        if (!response.ok) {
          return false
        }
        const data = (await response.json()) as { message: OwnerMessage }
        mergeMessages([data.message])
        activity.recordAction(section, "chat_message_sent")
        activity.flushNow()
        return true
      } catch {
        // Leave the composer text intact so the owner can retry.
        return false
      } finally {
        setSending(false)
      }
    },
    [activity, mergeMessages, section, sending, stage]
  )

  return { markRead, messages, send, sending, unread }
}
