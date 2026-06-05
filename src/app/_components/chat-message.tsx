type ChatSpeaker = "assistant" | "owner"

type ChatMessageProps = {
  readonly message: string
  readonly speaker: ChatSpeaker
}

export function ChatMessage({ message, speaker }: ChatMessageProps) {
  return (
    <p className="gx-bubble" data-speaker={speaker}>
      {message}
    </p>
  )
}
