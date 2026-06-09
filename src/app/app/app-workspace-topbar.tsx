"use client"

export function AppWorkspaceTopBar() {
  return (
    <>
      <div className="gx-app-identity">
        <div className="gx-app-avatar" aria-hidden="true">
          X
        </div>
        <div className="min-w-0">
          <b>글로컬엑스</b>
          <small>
            <span aria-hidden="true" className="gx-online-dot" /> AI 마케팅
            매니저 · 온라인
          </small>
        </div>
      </div>
      <span
        aria-label="더보기"
        className="gx-app-menu"
        role="img"
      >
        ⋮
      </span>
    </>
  )
}
