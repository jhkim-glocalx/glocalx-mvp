"use client"

import type { ReactNode } from "react"

type BottomNavItem = {
  readonly icon?: ReactNode
  readonly id: string
  readonly label: string
}

type BottomNavProps = {
  readonly activeId: string
  readonly items: ReadonlyArray<BottomNavItem>
  readonly onSelect: (id: string) => void
}

export function BottomNav({ activeId, items, onSelect }: BottomNavProps) {
  return (
    <nav aria-label="Primary navigation" className="gx-bottom-nav">
      {items.map((item) => (
        <button
          aria-current={item.id === activeId ? "page" : undefined}
          className="gx-tab"
          key={item.id}
          onClick={() => onSelect(item.id)}
          type="button"
        >
          {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
