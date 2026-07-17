import type { ReactNode, Ref } from "react"

type ResponsiveShellProps = {
  readonly bottomBar?: ReactNode
  readonly bottomNav?: ReactNode
  readonly children: ReactNode
  readonly className?: string
  // Rendered inside the shell's positioning context, above the scroll area —
  // for overlays like the chat widget that anchor to the phone, not the page.
  readonly overlay?: ReactNode
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
  overlay,
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
      {overlay}
    </div>
  )
}

export const MobileShell = ResponsiveShell
