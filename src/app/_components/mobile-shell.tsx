import type { ReactNode, Ref } from "react"

type ResponsiveShellProps = {
  readonly bottomBar?: ReactNode
  readonly bottomNav?: ReactNode
  readonly children: ReactNode
  readonly className?: string
  readonly screenClassName?: string
  readonly screenRef?: Ref<HTMLDivElement>
  readonly testId?: string
  readonly topBar?: ReactNode
}

export function ResponsiveShell({
  bottomBar,
  bottomNav,
  children,
  className,
  screenClassName,
  screenRef,
  testId,
  topBar,
}: ResponsiveShellProps) {
  return (
    <div
      className={["gx-shell", className].filter(Boolean).join(" ")}
      data-testid={testId}
    >
      {topBar ? <header className="gx-appbar">{topBar}</header> : null}
      <div
        className={["gx-screen", screenClassName].filter(Boolean).join(" ")}
        ref={screenRef}
      >
        {children}
      </div>
      {bottomBar}
      {bottomNav}
    </div>
  )
}

export const MobileShell = ResponsiveShell
