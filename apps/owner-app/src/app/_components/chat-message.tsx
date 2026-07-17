import type { ReactNode } from "react"

type ChatSpeaker = "assistant" | "owner"

type ChatMessageProps = {
  readonly children?: ReactNode
  readonly message?: string
  readonly speaker: ChatSpeaker
}

export function ChatMessage({ children, message, speaker }: ChatMessageProps) {
  return (
    <div className="gx-chat-row gx-rise" data-speaker={speaker}>
      {speaker === "assistant" ? (
        <span className="gx-chat-avatar" aria-hidden="true">
          X
        </span>
      ) : null}
      <p className="gx-bubble" data-speaker={speaker}>
        {children ?? message}
      </p>
    </div>
  )
}
