import type { ReactNode } from "react"

type MobileShellProps = {
  readonly bottomNav?: ReactNode
  readonly children: ReactNode
  readonly className?: string
  readonly screenClassName?: string
  readonly testId?: string
  readonly topBar?: ReactNode
}

export function MobileShell({
  bottomNav,
  children,
  className,
  screenClassName,
  testId,
  topBar,
}: MobileShellProps) {
  return (
    <div
      className={["gx-shell", className].filter(Boolean).join(" ")}
      data-testid={testId}
    >
      {topBar ? <header className="gx-appbar">{topBar}</header> : null}
      <div className={["gx-screen", screenClassName].filter(Boolean).join(" ")}>
        {children}
      </div>
      {bottomNav}
    </div>
  )
}
