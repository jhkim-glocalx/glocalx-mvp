import type { ReactNode } from "react"

type MobileShellProps = {
  readonly bottomNav?: ReactNode
  readonly children: ReactNode
  readonly testId?: string
  readonly topBar?: ReactNode
}

export function MobileShell({
  bottomNav,
  children,
  testId,
  topBar,
}: MobileShellProps) {
  return (
    <div className="gx-shell" data-testid={testId}>
      {topBar ? <header className="gx-appbar">{topBar}</header> : null}
      <div className="gx-screen">{children}</div>
      {bottomNav}
    </div>
  )
}
