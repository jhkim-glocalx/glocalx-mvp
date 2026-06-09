"use client"

type ReferenceComposerProps = {
  readonly label?: string
}

export function ReferenceComposer({
  label = "메시지 입력…",
}: ReferenceComposerProps) {
  return (
    <div className="gx-inputbar" aria-label="메시지 작성">
      <button aria-label="첨부 추가" className="gx-input-plus" type="button">
        +
      </button>
      <span className="gx-fake-input">{label}</span>
      <button aria-label="전송" className="gx-input-send" type="button">
        <span aria-hidden="true">➤</span>
      </button>
    </div>
  )
}
