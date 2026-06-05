"use client"

type ActionChipProps = {
  readonly buttonType?: "button" | "submit"
  readonly disabled?: boolean
  readonly label: string
  readonly onClick?: () => void
}

export function ActionChip({
  buttonType = "button",
  disabled = false,
  label,
  onClick,
}: ActionChipProps) {
  return (
    <button
      className="gx-chip"
      disabled={disabled}
      onClick={onClick}
      type={buttonType}
    >
      {label}
    </button>
  )
}
