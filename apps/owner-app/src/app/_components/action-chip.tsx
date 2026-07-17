"use client"

type ActionChipProps = {
  readonly buttonType?: "button" | "submit"
  readonly disabled?: boolean
  readonly label: string
  readonly onClick?: () => void
  readonly tone?: "primary" | "ghost"
}

export function ActionChip({
  buttonType = "button",
  disabled = false,
  label,
  onClick,
  tone = "primary",
}: ActionChipProps) {
  return (
    <button
      className="gx-chip"
      data-tone={tone}
      disabled={disabled}
      onClick={onClick}
      type={buttonType}
    >
      {label}
    </button>
  )
}
