"use client"

import { useEffect, useRef, useState } from "react"

import type { OwnerMessage } from "./use-cs-chat"

type ChatPanelProps = {
  readonly messages: readonly OwnerMessage[]
  readonly onClose: () => void
  readonly onSend: (body: string) => Promise<boolean>
  readonly sending: boolean
  // "sheet" fills the shell instead of floating in the corner — the dock for
  // screens whose own composer owns the bottom-right corner (onboarding).
  readonly variant?: "corner" | "sheet"
}

// The support conversation itself. Presentational: every message, poll and send
// lives in useCsChat, so a surface picks its own trigger (FAB, top-bar button)
// without forking this.
export function ChatPanel({
  messages,
  onClose,
  onSend,
  sending,
  variant = "corner",
}: ChatPanelProps) {
  const [input, setInput] = useState("")
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listRef.current !== null) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  async function handleSend(): Promise<void> {
    const body = input.trim()
    if (body.length === 0 || sending) {
      return
    }
    if (await onSend(body)) {
      setInput("")
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
    <section
      aria-label="고객 지원 대화"
      className={
        variant === "sheet" ? "gx-chat-panel gx-chat-sheet" : "gx-chat-panel"
      }
      data-testid="chat-panel"
    >
      <header className="gx-chat-panel-head">
        <div>
          <b>글로컬엑스 매니저</b>
          <small>보통 몇 분 내 답장</small>
        </div>
        <button
          aria-label="대화 닫기"
          className="gx-chat-close"
          onClick={onClose}
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
  )
}
