"use client"

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react"

type ReferenceComposerProps = {
  readonly focusKey?: number
  readonly label?: string
  readonly onAttach?: () => void
  readonly onChange?: (message: string) => void
  readonly onSubmit?: (message: string) => void
  readonly value?: string
}

export function ReferenceComposer({
  focusKey,
  label = "메시지 입력…",
  onAttach,
  onChange,
  onSubmit,
  value,
}: ReferenceComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [internalMessage, setInternalMessage] = useState("")
  const message = value ?? internalMessage

  useEffect(() => {
    if (focusKey === undefined) {
      return
    }

    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusKey])

  function updateMessage(nextMessage: string): void {
    if (value === undefined) {
      setInternalMessage(nextMessage)
    }

    onChange?.(nextMessage)
  }

  function submitMessage(): void {
    const trimmedMessage = message.trim()
    if (trimmedMessage === "") {
      return
    }

    onSubmit?.(trimmedMessage)
    updateMessage("")
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    submitMessage()
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== "Enter") {
      return
    }

    event.preventDefault()
    submitMessage()
  }

  return (
    <form className="gx-inputbar" aria-label="메시지 작성" onSubmit={handleSubmit}>
      <button
        aria-label="첨부 추가"
        className="gx-input-plus"
        onClick={onAttach}
        type="button"
      >
        +
      </button>
      <label className="sr-only" htmlFor="reference-composer-input">
        메시지 입력
      </label>
      <input
        className="gx-composer-input"
        id="reference-composer-input"
        onChange={(event) => updateMessage(event.currentTarget.value)}
        onKeyDown={handleInputKeyDown}
        placeholder={label}
        ref={inputRef}
        type="text"
        value={message}
      />
      <button aria-label="전송" className="gx-input-send" type="submit">
        <span aria-hidden="true">➤</span>
      </button>
    </form>
  )
}
