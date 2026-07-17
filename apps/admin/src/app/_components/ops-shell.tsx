"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const sections = [
  { href: "/stores", label: "Stores" },
  { href: "/inbox", label: "Inbox" },
  { href: "/queue", label: "Queue" },
  { href: "/settings", label: "Settings" },
] as const

type OpsShellProps = {
  readonly children: React.ReactNode
}

export function OpsShell({ children }: OpsShellProps) {
  const pathname = usePathname()

  return (
    <div className="ops-shell">
      <aside className="ops-sidebar">
        <div className="ops-brand">
          GlocalX <span>Ops</span>
        </div>
        <nav aria-label="Sections">
          {sections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="ops-nav-link"
              aria-current={
                pathname?.startsWith(section.href) ? "page" : undefined
              }
              style={{ display: "block" }}
            >
              {section.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="ops-main">{children}</main>
    </div>
  )
}
