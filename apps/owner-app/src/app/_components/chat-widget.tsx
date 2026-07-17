"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { ActivitySection } from "@glocalx/domain/support/contracts"

import type { ActivityRecorder } from "./use-activity-trail"

type OwnerMessage = {
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

type ChatWidgetProps = {
  readonly section: ActivitySection
  readonly activity: ActivityRecorder
}

// Floating chat on the authenticated surface (architecture §3). Polls the
// cursor endpoint — 3s open for liveness, 30s closed for the unread badge —
// so send latency never depends on an operator (or, in Phase 2, the AI).
export function ChatWidget({ activity, section }: ChatWidgetProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<readonly OwnerMessage[]>([])
  const [unread, setUnread] = useState(0)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const cursorRef = useRef<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
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

  const markRead = useCallback(async () => {
    setUnread(0)
    try {
      await fetch("/api/chat/messages/read", {
        body: "{}",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
    } catch {
      // A missed mark-read self-heals on the next open.
    }
  }, [])

  useEffect(() => {
    void poll()
    const timer = setInterval(
      () => void poll(),
      open ? openPollMs : closedPollMs
    )
    return () => clearInterval(timer)
  }, [open, poll])

  useEffect(() => {
    if (open && listRef.current !== null) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages, open])

  function toggleOpen(): void {
    const next = !open
    setOpen(next)
    activity.recordAction(section, next ? "chat_opened" : "chat_closed")
    if (next) {
      void markRead()
    }
  }

  async function handleSend(): Promise<void> {
    const body = input.trim()
    if (body.length === 0 || sending) {
      return
    }
    setSending(true)
    try {
      const response = await fetch("/api/chat/messages", {
        body: JSON.stringify({
          body,
          context: { activityTrail: activity.getTrail(), section, stage: null },
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      if (response.ok) {
        const data = (await response.json()) as { message: OwnerMessage }
        mergeMessages([data.message])
        setInput("")
        activity.recordAction(section, "chat_message_sent")
        activity.flushNow()
      }
    } catch {
      // Leave the composer text intact so the owner can retry.
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="gx-chat-widget" data-testid="chat-widget">
      {open ? (
        <section className="gx-chat-panel" aria-label="고객 지원 대화">
          <header className="gx-chat-panel-head">
            <div>
              <b>글로컬엑스 매니저</b>
              <small>보통 몇 분 내 답장</small>
            </div>
            <button
              aria-label="대화 닫기"
              className="gx-chat-close"
              onClick={toggleOpen}
              type="button"
            >
              ✕
            </button>
          </header>
          <div
            className="gx-chat-messages"
            ref={listRef}
            data-testid="chat-messages"
          >
            {messages.length === 0 ? (
              <p className="gx-chat-empty">
                궁금한 점을 남겨주세요. 담당 매니저가 도와드릴게요.
              </p>
            ) : (
              messages.map((message) => (
                <div
                  className={`gx-chat-bubble gx-chat-bubble-${message.sender}`}
                  key={message.id}
                >
                  {message.body}
                </div>
              ))
            )}
          </div>
          <div className="gx-chat-composer">
            <textarea
              aria-label="메시지 입력"
              className="gx-chat-input"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하세요"
              rows={1}
              value={input}
            />
            <button
              className="gx-chat-send"
              disabled={input.trim().length === 0 || sending}
              onClick={() => void handleSend()}
              type="button"
            >
              보내기
            </button>
          </div>
        </section>
      ) : null}
      <button
        aria-label={open ? "대화 닫기" : "고객 지원 대화 열기"}
        className="gx-chat-fab"
        data-testid="chat-fab"
        onClick={toggleOpen}
        type="button"
      >
        <span aria-hidden="true">{open ? "✕" : "💬"}</span>
        {!open && unread > 0 ? (
          <span className="gx-chat-badge" data-testid="chat-unread-badge">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
    </div>
  )
}
