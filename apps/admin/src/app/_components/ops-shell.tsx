"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

const sections = [
  { href: "/stores", label: "매장" },
  { href: "/inbox", label: "인박스" },
  { href: "/queue", label: "대기열" },
  { href: "/posts", label: "게시물" },
  { href: "/users", label: "사용자" },
  { href: "/settings", label: "설정" },
] as const

type OpsShellProps = {
  readonly children: React.ReactNode
  readonly operatorName: string
}

export function OpsShell({ children, operatorName }: OpsShellProps) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useRef<HTMLDialogElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  function closeDrawer(): void {
    const drawer = drawerRef.current
    if (drawer?.open) {
      drawer.close()
    }
    setDrawerOpen(false)
    menuButtonRef.current?.focus()
  }

  function openDrawer(): void {
    setDrawerOpen(true)
  }

  useEffect(() => {
    const drawer = drawerRef.current
    if (drawer === null) {
      return
    }
    if (drawerOpen && !drawer.open) {
      drawer.showModal()
      drawer.querySelector<HTMLButtonElement>("[data-drawer-close]")?.focus()
    } else if (!drawerOpen && drawer.open) {
      drawer.close()
    }
  }, [drawerOpen])

  const nav = (
    <nav aria-label="섹션">
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          className="ops-nav-link"
          aria-current={pathname?.startsWith(section.href) ? "page" : undefined}
          onClick={() => {
            if (drawerOpen) closeDrawer()
          }}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  )

  return (
    <div className="ops-shell">
      <aside className="ops-sidebar">
        <div className="ops-brand">
          GlocalX <span>Ops</span>
        </div>
        {nav}
        <div className="ops-sidebar-footer">
          <span className="ops-operator-name">{operatorName}</span>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="ops-logout-button">
              로그아웃
            </button>
          </form>
        </div>
      </aside>
      <main className="ops-main">
        <button
          ref={menuButtonRef}
          type="button"
          className="ops-menu-button"
          aria-expanded={drawerOpen}
          aria-controls="ops-mobile-drawer"
          onClick={openDrawer}
        >
          메뉴
        </button>
        {children}
      </main>
      <dialog
        ref={drawerRef}
        id="ops-mobile-drawer"
        className="ops-drawer"
        aria-label="운영 메뉴"
        aria-labelledby="ops-drawer-title"
        onCancel={(event) => {
          event.preventDefault()
          closeDrawer()
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDrawer()
        }}
      >
        <div className="ops-drawer-panel">
          <div className="ops-drawer-head">
            <strong id="ops-drawer-title">GlocalX Ops</strong>
            <button
              type="button"
              className="ops-drawer-close"
              data-drawer-close
              aria-label="메뉴 닫기"
              onClick={closeDrawer}
            >
              닫기
            </button>
          </div>
          {nav}
          <div className="ops-sidebar-footer">
            <span className="ops-operator-name">{operatorName}</span>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="ops-logout-button">
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </div>
  )
}
