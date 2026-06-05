import type { ReactNode } from "react"

type PhoneFrameProps = {
  readonly children: ReactNode
}

export function PhoneFrame({ children }: PhoneFrameProps) {
  return (
    <div className="gx-phone">
      <div className="gx-phone-screen">{children}</div>
    </div>
  )
}
