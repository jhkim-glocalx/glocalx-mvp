"use client"

import { useState } from "react"

import type { ActivitySection } from "@glocalx/domain/support/contracts"

import { ChatPanel } from "./chat-panel"
import type { ActivityRecorder } from "./use-activity-trail"
import { useCsChat } from "./use-cs-chat"

type ChatWidgetProps = {
  readonly section: ActivitySection
  readonly activity: ActivityRecorder
}

// Floating chat on the authenticated surface (architecture §3): the corner FAB
// dock, for screens with no composer of their own.
export function ChatWidget({ activity, section }: ChatWidgetProps) {
  const [open, setOpen] = useState(false)
  const chat = useCsChat({ activity, open, section })

  function toggleOpen(): void {
    const next = !open
    setOpen(next)
    activity.recordAction(section, next ? "chat_opened" : "chat_closed")
    if (next) {
      chat.markRead()
    }
  }

  return (
    <div className="gx-chat-widget" data-testid="chat-widget">
      {open ? (
        <ChatPanel
          messages={chat.messages}
          onClose={toggleOpen}
          onSend={chat.send}
          sending={chat.sending}
        />
      ) : null}
      <button
        aria-label={open ? "대화 닫기" : "고객 지원 대화 열기"}
        className="gx-chat-fab"
        data-testid="chat-fab"
        onClick={toggleOpen}
        type="button"
      >
        <span aria-hidden="true">{open ? "✕" : "💬"}</span>
        {!open && chat.unread > 0 ? (
          <span className="gx-chat-badge" data-testid="chat-unread-badge">
            {chat.unread > 9 ? "9+" : chat.unread}
          </span>
        ) : null}
      </button>
    </div>
  )
}
