"use client"

export function AppWorkspaceTopBar() {
  return (
    <>
      <div className="gx-app-identity">
        <div className="gx-app-avatar" aria-hidden="true">
          X
        </div>
        <div className="min-w-0">
          <b>GlocalX · 브런치모먼트 홍대점</b>
          <small>AI 마케팅 매니저 · 온라인</small>
        </div>
      </div>
      <div className="grid shrink-0 justify-items-end gap-1">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-[11px] font-black text-[var(--ink)]">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-[var(--mint)]"
          />
          GBP
        </span>
        <span className="rounded-full bg-[var(--mint-soft)] px-2.5 py-1 text-[11px] font-black text-[var(--ink)]">
          연결됨
        </span>
      </div>
    </>
  )
}
