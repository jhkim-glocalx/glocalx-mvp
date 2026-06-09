"use client"

import type { ReactNode } from "react"

import type { StoreProfileDraft } from "./onboarding-model"

export type StoreProfileField =
  | "name"
  | "address"
  | "phone"
  | "category"
  | "hours"

export function StatusPill({ children }: { readonly children: ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--line)] bg-white px-3 py-2 text-xs font-black text-[var(--ink-soft)] shadow-sm">
      {children}
    </span>
  )
}

export function TypingIndicator({ label }: { readonly label: string }) {
  return (
    <div
      aria-live="polite"
      className="gx-bubble flex w-fit items-center gap-1.5"
      data-speaker="assistant"
      role="status"
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className="h-2 w-2 animate-pulse rounded-full bg-[var(--muted)]"
      />
      <span
        aria-hidden="true"
        className="h-2 w-2 animate-pulse rounded-full bg-[var(--muted)] [animation-delay:120ms]"
      />
      <span
        aria-hidden="true"
        className="h-2 w-2 animate-pulse rounded-full bg-[var(--muted)] [animation-delay:240ms]"
      />
    </div>
  )
}

export function CandidatePicker({
  candidates,
  onSelect,
  selectedCandidateId,
}: {
  readonly candidates: readonly StoreProfileDraft[]
  readonly onSelect: (candidate: StoreProfileDraft) => void
  readonly selectedCandidateId: string
}) {
  if (candidates.length <= 1) {
    return null
  }

  return (
    <div aria-label="네이버 후보 선택" className="grid gap-2">
      {candidates.map((candidate) => (
        <button
          className="gx-onboarding-primary"
          data-selected={candidate.candidateId === selectedCandidateId}
          key={candidate.candidateId}
          onClick={() => onSelect(candidate)}
          type="button"
        >
          {candidate.name} · {candidate.address}
        </button>
      ))}
    </div>
  )
}

export function StoreInfoCard({
  draft,
}: {
  readonly draft: StoreProfileDraft
}) {
  return (
    <article className="gx-status-card" data-status="success">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold text-[var(--ink-soft)]">
          네이버 후보
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[var(--mint)]">
          자동 추출
        </span>
      </div>
      <strong className="text-xl leading-tight">{draft.name}</strong>
      <dl className="grid gap-2 text-sm font-bold text-[var(--ink-soft)]">
        <div className="grid gap-1">
          <dt className="text-[11px] font-black uppercase text-[var(--muted)]">
            주소
          </dt>
          <dd>{draft.address}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-[11px] font-black uppercase text-[var(--muted)]">
            업종
          </dt>
          <dd>{draft.category}</dd>
        </div>
      </dl>
    </article>
  )
}

function ProfileInput({
  field,
  label,
  onChange,
  required,
  value,
}: {
  readonly field: StoreProfileField
  readonly label: string
  readonly onChange: (field: StoreProfileField, value: string) => void
  readonly required?: boolean
  readonly value: string
}) {
  return (
    <label className="grid gap-2 text-sm font-black text-[var(--ink)]">
      {label}
      <input
        className="gx-onboarding-input"
        onChange={(event) => onChange(field, event.currentTarget.value)}
        required={required}
        type="text"
        value={value}
      />
    </label>
  )
}

export function StoreProfileConfirmForm({
  disabled,
  draft,
  onChange,
  onConfirm,
}: {
  readonly disabled: boolean
  readonly draft: StoreProfileDraft
  readonly onChange: (field: StoreProfileField, value: string) => void
  readonly onConfirm: () => void
}) {
  return (
    <form
      className="gx-onboarding-form"
      onSubmit={(event) => {
        event.preventDefault()
        onConfirm()
      }}
    >
      <ProfileInput
        field="name"
        label="상호"
        onChange={onChange}
        required
        value={draft.name}
      />
      <ProfileInput
        field="address"
        label="주소"
        onChange={onChange}
        required
        value={draft.address}
      />
      <ProfileInput
        field="phone"
        label="전화번호"
        onChange={onChange}
        required
        value={draft.phone}
      />
      <ProfileInput
        field="category"
        label="업종"
        onChange={onChange}
        required
        value={draft.category}
      />
      <ProfileInput
        field="hours"
        label="영업시간"
        onChange={onChange}
        value={draft.hours}
      />
      <button
        className="gx-onboarding-primary"
        disabled={disabled}
        type="submit"
      >
        매장 정보 확인
      </button>
    </form>
  )
}
