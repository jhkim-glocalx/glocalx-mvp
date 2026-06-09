import type { ReactNode } from "react"

type MobileShellProps = {
  readonly bottomBar?: ReactNode
  readonly bottomNav?: ReactNode
  readonly children: ReactNode
  readonly className?: string
  readonly screenClassName?: string
  readonly testId?: string
  readonly topBar?: ReactNode
}

export function MobileShell({
  bottomBar,
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
      <span className="gx-device-island" aria-hidden="true" />
      <div className="gx-phone-screen">
        <div className="gx-statusbar" aria-hidden="true">
          <span>11:55</span>
          <span className="gx-status-icons">
            <span className="gx-signal" />
            <span className="gx-battery" />
          </span>
        </div>
        {topBar ? <header className="gx-appbar">{topBar}</header> : null}
        <div
          className={["gx-screen", screenClassName].filter(Boolean).join(" ")}
        >
          {children}
        </div>
        {bottomBar}
        {bottomNav}
      </div>
    </div>
  )
}
