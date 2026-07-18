"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type {
  InboxConversationView,
  InboxMessageView,
} from "@/server/inbox-view"

type ConversationListResponse = {
  readonly conversations: readonly InboxConversationView[]
}

type ConversationDetailResponse = {
  readonly conversation: InboxConversationView
  readonly messages: readonly InboxMessageView[]
  readonly nextCursor: string | null
}

const listPollMs = 5000
const detailPollMs = 5000

type InboxConsoleProps = {
  readonly operatorAdminId: string
  readonly initialConversations: readonly InboxConversationView[]
}

// Operator inbox (delivery-plan Phase 1 §5). The list polls every 5s with
// awaiting-reply conversations floated to the top; opening one polls its
// messages (and marks the owner's read, clearing the awaiting badge). Replies
// post as the single "assistant" persona the owner sees.
export function InboxConsole({
  initialConversations,
  operatorAdminId,
}: InboxConsoleProps) {
  const [conversations, setConversations] =
    useState<readonly InboxConversationView[]>(initialConversations)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [conversation, setConversation] =
    useState<InboxConversationView | null>(null)
  const [messages, setMessages] = useState<readonly InboxMessageView[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const cursorRef = useRef<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  const pollList = useCallback(async () => {
    const url = "/api/inbox/conversations"
    try {
      const response = await fetch(url)
      if (!response.ok) {
        return
      }
      const data = (await response.json()) as ConversationListResponse
      setConversations(data.conversations)
    } catch {
      // Best-effort; the next tick reconciles.
    }
  }, [])

  const pollDetail = useCallback(async () => {
    const conversationId = selectedRef.current
    if (conversationId === null) {
      return
    }
    const cursor = cursorRef.current
    const url =
      cursor === null
        ? `/api/inbox/conversations/${conversationId}/messages`
        : `/api/inbox/conversations/${conversationId}/messages?after=${encodeURIComponent(cursor)}`
    try {
      const response = await fetch(url)
      if (!response.ok) {
        return
      }
      const data = (await response.json()) as ConversationDetailResponse
      // The conversation may have been switched while the request was in
      // flight — drop a stale response rather than cross-render it.
      if (selectedRef.current !== conversationId) {
        return
      }
      setConversation(data.conversation)
      if (data.nextCursor !== null) {
        cursorRef.current = data.nextCursor
      }
      if (data.messages.length > 0) {
        setMessages((previous) => {
          const seen = new Set(previous.map((message) => message.id))
          const added = data.messages.filter((message) => !seen.has(message.id))
          return added.length === 0 ? previous : [...previous, ...added]
        })
      }
    } catch {
      // Best-effort; the next tick reconciles.
    }
  }, [])

  useEffect(() => {
    // The list is server-rendered on mount, so the first refresh can wait for
    // the interval tick rather than firing synchronously in the effect.
    const timer = setInterval(() => void pollList(), listPollMs)
    return () => clearInterval(timer)
  }, [pollList])

  useEffect(() => {
    if (selectedId === null) {
      return
    }
    void pollDetail()
    const timer = setInterval(() => void pollDetail(), detailPollMs)
    return () => clearInterval(timer)
  }, [selectedId, pollDetail])

  useEffect(() => {
    if (listRef.current !== null) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  function selectConversation(next: InboxConversationView): void {
    cursorRef.current = null
    setMessages([])
    setConversation(next)
    setSelectedId(next.id)
  }

  async function sendReply(): Promise<void> {
    const conversationId = selectedId
    const body = input.trim()
    if (conversationId === null || body.length === 0 || busy) {
      return
    }
    setBusy(true)
    try {
      const response = await fetch(
        `/api/inbox/conversations/${conversationId}/reply`,
        {
          body: JSON.stringify({ body }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      )
      if (response.ok) {
        setInput("")
        await pollDetail()
        await pollList()
      }
    } catch {
      // Keep the draft so the operator can retry.
    } finally {
      setBusy(false)
    }
  }

  async function runAction(action: "assign" | "resolve"): Promise<void> {
    const conversationId = selectedId
    if (conversationId === null || busy) {
      return
    }
    setBusy(true)
    try {
      const response = await fetch(
        `/api/inbox/conversations/${conversationId}/${action}`,
        {
          body: "{}",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      )
      if (response.ok) {
        const data = (await response.json()) as {
          conversation: InboxConversationView
        }
        setConversation(data.conversation)
        if (action === "resolve") {
          setSelectedId(null)
          setConversation(null)
          setMessages([])
        }
        await pollList()
      }
    } catch {
      // Best-effort; state reconciles on the next poll.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ops-inbox">
      <aside className="ops-inbox-list" aria-label="Conversations">
        {conversations.length === 0 ? (
          <p className="ops-inbox-empty">No open conversations.</p>
        ) : (
          conversations.map((item) => (
            <button
              key={item.id}
              type="button"
              className="ops-inbox-item"
              aria-current={item.id === selectedId ? "true" : undefined}
              data-awaiting={item.unreadFromOwner > 0 ? "true" : undefined}
              onClick={() => selectConversation(item)}
            >
              <span className="ops-inbox-item-head">
                <span className="ops-inbox-store">{item.storeName}</span>
                {item.unreadFromOwner > 0 ? (
                  <span
                    className="ops-inbox-badge"
                    data-testid="inbox-unread-badge"
                  >
                    {item.unreadFromOwner}
                  </span>
                ) : null}
              </span>
              <span className="ops-inbox-preview">
                {item.lastMessageSender === "owner" ? "" : "↩ "}
                {item.lastMessageBody ?? "—"}
              </span>
            </button>
          ))
        )}
      </aside>

      {conversation === null ? (
        <section className="ops-inbox-detail ops-inbox-detail-empty">
          <p>Select a conversation to view its context and reply.</p>
        </section>
      ) : (
        <section className="ops-inbox-detail" data-testid="inbox-detail">
          <header className="ops-inbox-detail-head">
            <div>
              <strong>{conversation.storeName}</strong>
              <span className="ops-inbox-status">{conversation.status}</span>
            </div>
            <div className="ops-inbox-actions">
              <button
                type="button"
                className="ops-inbox-action"
                disabled={busy}
                aria-pressed={
                  conversation.assignedAdminId === operatorAdminId
                    ? "true"
                    : "false"
                }
                onClick={() => void runAction("assign")}
              >
                {conversation.assignedAdminId === operatorAdminId
                  ? "Assigned to me"
                  : "Assign to me"}
              </button>
              <button
                type="button"
                className="ops-inbox-action"
                disabled={busy || conversation.status === "resolved"}
                onClick={() => void runAction("resolve")}
              >
                Resolve
              </button>
            </div>
          </header>

          <div className="ops-inbox-messages" ref={listRef}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`ops-msg ops-msg-${message.sender === "owner" ? "owner" : "admin"}`}
              >
                <div className="ops-msg-body">{message.body}</div>
                {message.context !== null ? (
                  <div className="ops-msg-context" data-testid="msg-context">
                    <span className="ops-context-tag">
                      📍 {message.context.section}
                      {message.context.stage !== null
                        ? ` · ${message.context.stage}`
                        : ""}
                    </span>
                    {message.context.activityTrail.length > 0 ? (
                      <details className="ops-context-trail">
                        <summary>
                          Recent actions ({message.context.activityTrail.length}
                          )
                        </summary>
                        <ol>
                          {message.context.activityTrail.map((event, index) => (
                            <li key={`${message.id}-${index}`}>
                              {event.section} · {event.action}
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="ops-inbox-composer">
            <textarea
              aria-label="Reply"
              className="ops-inbox-input"
              placeholder="Reply to the owner…"
              rows={2}
              value={input}
              disabled={conversation.status === "resolved"}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void sendReply()
                }
              }}
            />
            <button
              type="button"
              className="ops-primary-button"
              disabled={
                busy ||
                input.trim().length === 0 ||
                conversation.status === "resolved"
              }
              onClick={() => void sendReply()}
            >
              Send
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
