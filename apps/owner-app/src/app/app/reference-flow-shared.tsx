"use client"

import type { CSSProperties, ReactNode } from "react"

import { appNavItems, type AppNavId } from "./app-workspace-model"

export type BarStyle = CSSProperties & {
  readonly "--bar": string
}

export function barStyle(value: string): BarStyle {
  return { "--bar": value }
}

export function FlowNav({
  activeNavId,
  onSelect,
}: {
  readonly activeNavId: AppNavId
  readonly onSelect: (navId: AppNavId) => void
}) {
  return (
    <nav aria-label="화면 단계" className="gx-flow-nav">
      {appNavItems.map((item) => (
        <button
          aria-current={item.id === activeNavId ? "page" : undefined}
          className="gx-flow-tab"
          key={item.id}
          onClick={() => onSelect(item.id)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}

export function ChatDivider({ children }: { readonly children: ReactNode }) {
  return <div className="gx-chat-divider">{children}</div>
}

export function FlowCard({
  children,
  title,
}: {
  readonly children: ReactNode
  readonly title: string
}) {
  return (
    <article className="gx-ref-card gx-rise">
      <header className="gx-ref-card-header">
        <span aria-hidden="true" className="gx-card-dot" />
        <strong>{title}</strong>
      </header>
      <div className="gx-ref-card-body">{children}</div>
    </article>
  )
}

export function ChoiceButton({
  children,
  disabled = false,
  onClick,
  tone = "primary",
}: {
  readonly children: ReactNode
  readonly disabled?: boolean
  readonly onClick?: () => void
  readonly tone?: "primary" | "ghost"
}) {
  return (
    <button
      className="gx-choice-chip"
      data-tone={tone}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

export function MetricTile({
  label,
  trend,
  value,
}: {
  readonly label: string
  readonly trend: string
  readonly value: string
}) {
  return (
    <div className="gx-report-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{trend}</em>
    </div>
  )
}
