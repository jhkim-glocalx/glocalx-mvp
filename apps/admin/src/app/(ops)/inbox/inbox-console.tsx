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
  readonly pendingDraft: InboxMessageView | null
  readonly nextCursor: string | null
}

const listPollMs = 5000
const detailPollMs = 5000

// The three per-conversation postures an operator can flip between (delivery-plan
// Phase 2 §3). Labels are operator-facing; the owner never sees any of this.
const modeOptions = [
  { value: "human", label: "수동" },
  { value: "ai_draft", label: "AI 초안" },
  { value: "ai", label: "AI 자동" },
] as const

const conversationStatusLabels: Readonly<Record<string, string>> = {
  open: "진행 중",
  resolved: "해결됨",
}

// Activity-telemetry tags (packages/domain/src/support/activity.ts) — closed
// enums surfaced verbatim in the "where the owner is" context tag and the
// activity trail, so an untranslated addition there falls back to the raw
// English/snake_case tag rather than breaking.
const activitySectionLabels: Readonly<Record<string, string>> = {
  onboarding: "온보딩",
  gbp_connect: "GBP 연결",
  home: "홈",
  marketing: "마케팅",
  reviews: "리뷰",
  performance: "실적",
  chat: "채팅",
}

const activityStageLabels: Readonly<Record<string, string>> = {
  store_input: "매장 정보 입력",
  extracting: "정보 추출 중",
  candidate_selection: "후보 선택",
  manual_entry: "직접 입력",
  profile_summary: "프로필 요약",
  oauth: "OAuth 인증",
  location_select: "리스팅 선택",
  access_pending: "권한 대기 중",
  intake: "접수",
  review: "검토",
}

const activityActionLabels: Readonly<Record<string, string>> = {
  section_viewed: "화면 조회",
  onboarding_started: "온보딩 시작",
  store_extraction_submitted: "매장 정보 제출",
  store_extraction_failed: "매장 정보 추출 실패",
  store_confirmed: "매장 정보 확인",
  gbp_connect_started: "GBP 연결 시작",
  gbp_oauth_completed: "GBP OAuth 완료",
  gbp_connect_failed: "GBP 연결 실패",
  gbp_access_requested: "GBP 권한 요청",
  campaign_intake_opened: "캠페인 접수 화면 열림",
  campaign_upload_failed: "캠페인 업로드 실패",
  campaign_submitted: "캠페인 제출",
  campaign_review_opened: "캠페인 검토 화면 열림",
  campaign_decision_submitted: "캠페인 결정 제출",
  chat_opened: "채팅 열림",
  chat_closed: "채팅 닫힘",
  chat_message_sent: "채팅 메시지 전송",
}

type InboxConsoleProps = {
  readonly operatorAdminId: string
  readonly initialConversations: readonly InboxConversationView[]
}

// Operator inbox (delivery-plan Phase 1 §5, extended in Phase 2 §3). The list
// polls every 5s with awaiting-reply conversations floated to the top; opening
// one polls its messages (and marks the owner's read, clearing the awaiting
// badge). Operators flip the AI/human posture per conversation and review AI
// drafts before they reach the owner — who only ever sees one "assistant".
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
  const [pendingDraft, setPendingDraft] = useState<InboxMessageView | null>(
    null
  )
  const [draftInput, setDraftInput] = useState("")
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const cursorRef = useRef<string | null>(null)
  const selectedRef = useRef<string | null>(null)
  const draftIdRef = useRef<string | null>(null)
  const detailTicketRef = useRef(0)
  const appliedDetailTicketRef = useRef(0)
  const listTicketRef = useRef(0)
  const appliedListTicketRef = useRef(0)
  const detailConfirmedRef = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  // Detail state is last-write-wins by *arrival*, so a slow poll landing after a
  // newer one (or after an operator action) would revert the conversation's mode
  // and drop the pending draft — which re-seeds the editor and silently discards
  // an in-progress edit. Every detail read and every action that writes detail
  // state claims a ticket in issue order, then commits against a watermark of
  // what has already been applied.
  const claimDetailTicket = useCallback(() => {
    detailTicketRef.current += 1
    return detailTicketRef.current
  }, [])

  // False when this ticket is older than the state already applied. Gating on
  // the watermark rather than "is this the newest ticket issued" matters when
  // responses run slower than the poll interval: every response would then be
  // superseded before it arrived, and gating on newest-issued would apply none
  // of them, freezing the panel for as long as the backend stayed slow.
  const commitDetailTicket = useCallback((ticket: number) => {
    if (ticket <= appliedDetailTicketRef.current) {
      return false
    }
    appliedDetailTicketRef.current = ticket
    return true
  }, [])

  // Same arrival-order hazard as the detail poll, with milder stakes: the list
  // is replaced wholesale and holds no operator input, so a stale one only
  // shows outdated previews and unread badges until the next tick. Ordered for
  // the same reason regardless — an unread badge that flickers back after being
  // cleared reads as a real new message.
  const pollList = useCallback(async () => {
    const url = "/api/inbox/conversations"
    listTicketRef.current += 1
    const ticket = listTicketRef.current
    try {
      const response = await fetch(url)
      if (!response.ok) {
        return
      }
      const data = (await response.json()) as ConversationListResponse
      if (ticket <= appliedListTicketRef.current) {
        return
      }
      appliedListTicketRef.current = ticket
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
    const ticket = claimDetailTicket()
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
      // The conversation may have been switched, or newer state may have landed,
      // while the request was in flight — drop a stale response rather than
      // cross-render it or roll newer state back.
      if (
        selectedRef.current !== conversationId ||
        !commitDetailTicket(ticket)
      ) {
        return
      }
      detailConfirmedRef.current = true
      setConversation(data.conversation)
      // Seed the editable draft only when a *new* draft id appears, so a poll
      // mid-edit never clobbers the operator's in-progress text.
      const nextDraftId = data.pendingDraft?.id ?? null
      if (nextDraftId !== draftIdRef.current) {
        draftIdRef.current = nextDraftId
        setDraftInput(data.pendingDraft?.body ?? "")
      }
      setPendingDraft(data.pendingDraft)
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
  }, [claimDetailTicket, commitDetailTicket])

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
    commitDetailTicket(claimDetailTicket())
    // Seeded from the list row so the panel renders at once, but the list is up
    // to one poll interval old. Until the detail read lands, its `mode` is a
    // guess and must not be trusted to short-circuit a mode change.
    detailConfirmedRef.current = false
    cursorRef.current = null
    draftIdRef.current = null
    setMessages([])
    setPendingDraft(null)
    setDraftInput("")
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

  async function setMode(mode: string): Promise<void> {
    const conversationId = selectedId
    const alreadyInMode =
      detailConfirmedRef.current && conversation?.mode === mode
    if (conversationId === null || busy || alreadyInMode) {
      return
    }
    setBusy(true)
    try {
      const response = await fetch(
        `/api/inbox/conversations/${conversationId}/mode`,
        {
          body: JSON.stringify({ mode }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      )
      if (response.ok) {
        const data = (await response.json()) as {
          conversation: InboxConversationView
        }
        // The list stays clickable while an action is in flight, so the operator
        // may have selected another conversation by now. Applying this response
        // would render THAT conversation's header over this one's while the
        // composer still targets the selected id — a reply meant for one store
        // owner sent to another.
        if (selectedRef.current === conversationId) {
          commitDetailTicket(claimDetailTicket())
          detailConfirmedRef.current = true
          setConversation(data.conversation)
        }
        await pollList()
      }
    } catch {
      // Best-effort; state reconciles on the next poll.
    } finally {
      setBusy(false)
    }
  }

  async function sendDraft(): Promise<void> {
    const conversationId = selectedId
    const draft = pendingDraft
    const body = draftInput.trim()
    if (
      conversationId === null ||
      draft === null ||
      body.length === 0 ||
      busy
    ) {
      return
    }
    setBusy(true)
    try {
      const response = await fetch(
        `/api/inbox/conversations/${conversationId}/draft/send`,
        {
          body: JSON.stringify({ messageId: draft.id, body }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      )
      if (response.ok && selectedRef.current === conversationId) {
        commitDetailTicket(claimDetailTicket())
        draftIdRef.current = null
        setPendingDraft(null)
        setDraftInput("")
        await pollDetail()
        await pollList()
      }
    } catch {
      // Keep the draft so the operator can retry.
    } finally {
      setBusy(false)
    }
  }

  async function discardDraft(): Promise<void> {
    const conversationId = selectedId
    const draft = pendingDraft
    if (conversationId === null || draft === null || busy) {
      return
    }
    setBusy(true)
    try {
      const response = await fetch(
        `/api/inbox/conversations/${conversationId}/draft/discard`,
        {
          body: JSON.stringify({ messageId: draft.id }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      )
      if (response.ok && selectedRef.current === conversationId) {
        commitDetailTicket(claimDetailTicket())
        draftIdRef.current = null
        setPendingDraft(null)
        setDraftInput("")
      }
    } catch {
      // Best-effort; the next poll re-surfaces the draft if it survived.
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
        if (selectedRef.current !== conversationId) {
          // Same cross-conversation guard as setMode.
          await pollList()
          return
        }
        commitDetailTicket(claimDetailTicket())
        detailConfirmedRef.current = true
        setConversation(data.conversation)
        if (action === "resolve") {
          setSelectedId(null)
          setConversation(null)
          setMessages([])
          setPendingDraft(null)
          setDraftInput("")
        }
        await pollList()
      }
    } catch {
      // Best-effort; state reconciles on the next poll.
    } finally {
      setBusy(false)
    }
  }

  const resolved = conversation?.status === "resolved"

  return (
    <div className="ops-inbox">
      <aside className="ops-inbox-list" aria-label="대화 목록">
        {conversations.length === 0 ? (
          <p className="ops-inbox-empty">진행 중인 대화가 없습니다.</p>
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
                {item.flaggedAt !== null ? (
                  <span
                    className="ops-inbox-flag-dot"
                    data-testid="inbox-flag-dot"
                    title="AI 작성 실패"
                  >
                    ⚑
                  </span>
                ) : null}
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
          <p>대화를 선택하면 맥락을 보고 답장할 수 있습니다.</p>
        </section>
      ) : (
        <section className="ops-inbox-detail" data-testid="inbox-detail">
          <header className="ops-inbox-detail-head">
            <div>
              <strong>{conversation.storeName}</strong>
              <span className="ops-inbox-status">
                {conversationStatusLabels[conversation.status] ??
                  conversation.status}
              </span>
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
                  ? "나에게 할당됨"
                  : "나에게 할당"}
              </button>
              <button
                type="button"
                className="ops-inbox-action"
                disabled={busy || resolved}
                onClick={() => void runAction("resolve")}
              >
                해결 완료
              </button>
            </div>
          </header>

          <div
            className="ops-inbox-modebar"
            role="group"
            aria-label="응답 모드"
          >
            <span className="ops-modebar-label">모드</span>
            {modeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className="ops-mode-option"
                data-testid={`mode-${option.value}`}
                aria-pressed={
                  conversation.mode === option.value ? "true" : "false"
                }
                disabled={busy || resolved}
                onClick={() => void setMode(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {conversation.flaggedAt !== null ? (
            <div className="ops-inbox-flag" role="status">
              ⚑ AI 작성 실패
              {conversation.flagReason !== null
                ? ` (${conversation.flagReason})`
                : ""}
              . 검토 후 직접 답장해 주세요.
            </div>
          ) : null}

          <div className="ops-inbox-messages" ref={listRef}>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`ops-msg ops-msg-${message.sender === "owner" ? "owner" : message.authorKind === "ai" ? "ai" : "admin"}`}
              >
                {message.sender !== "owner" ? (
                  <span className="ops-msg-author">
                    {message.authorKind === "ai" ? "AI" : "운영자"}
                  </span>
                ) : null}
                <div className="ops-msg-body">{message.body}</div>
                {message.context !== null ? (
                  <div className="ops-msg-context" data-testid="msg-context">
                    <span className="ops-context-tag">
                      📍{" "}
                      {activitySectionLabels[message.context.section] ??
                        message.context.section}
                      {message.context.stage !== null
                        ? ` · ${activityStageLabels[message.context.stage] ?? message.context.stage}`
                        : ""}
                    </span>
                    {message.context.activityTrail.length > 0 ? (
                      <details className="ops-context-trail">
                        <summary>
                          최근 활동 ({message.context.activityTrail.length})
                        </summary>
                        <ol>
                          {message.context.activityTrail.map((event, index) => (
                            <li key={`${message.id}-${index}`}>
                              {activitySectionLabels[event.section] ??
                                event.section}{" "}
                              ·{" "}
                              {activityActionLabels[event.action] ??
                                event.action}
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

          {pendingDraft !== null ? (
            <div className="ops-inbox-draft" data-testid="ai-draft">
              <span className="ops-draft-label">
                AI 초안 — 전송 전 검토해 주세요
              </span>
              <textarea
                aria-label="AI 초안"
                className="ops-inbox-input"
                rows={3}
                value={draftInput}
                disabled={resolved}
                onChange={(event) => setDraftInput(event.target.value)}
              />
              <div className="ops-draft-actions">
                <button
                  type="button"
                  className="ops-inbox-action"
                  disabled={busy}
                  onClick={() => void discardDraft()}
                >
                  삭제
                </button>
                <button
                  type="button"
                  className="ops-primary-button"
                  disabled={busy || draftInput.trim().length === 0 || resolved}
                  onClick={() => void sendDraft()}
                >
                  초안 전송
                </button>
              </div>
            </div>
          ) : null}

          <div className="ops-inbox-composer">
            <textarea
              aria-label="답장"
              className="ops-inbox-input"
              placeholder="사장님에게 답장…"
              rows={2}
              value={input}
              disabled={resolved}
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
              disabled={busy || input.trim().length === 0 || resolved}
              onClick={() => void sendReply()}
            >
              전송
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
