export function TypingIndicator() {
  return (
    <div
      aria-label="글로컬엑스가 입력 중"
      className="gx-chat-row gx-rise"
      data-speaker="assistant"
      role="status"
    >
      <span className="gx-chat-avatar" aria-hidden="true">
        X
      </span>
      <span className="gx-bubble gx-typing" data-speaker="assistant">
        <i />
        <i />
        <i />
      </span>
    </div>
  )
}
