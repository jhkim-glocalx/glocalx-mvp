import { MobileShell } from "@/app/_components/mobile-shell"
import { appShellCopy } from "@/lib/app-shell"

const todayQueue = [
  { label: "가게 연결", value: "대기" },
  { label: "GBP 확인", value: "준비됨" },
  { label: "첫 게시글", value: "초안" },
] as const

export default function Home() {
  return (
    <main className="gx-entry-page">
      <MobileShell
        testId="entry-device"
        topBar={
          <div className="gx-entry-brand">
            <div className="gx-brand-mark">X</div>
            <div>
              <h1>{appShellCopy.productName}</h1>
              <p>브런치모먼트 홍대점</p>
            </div>
          </div>
        }
      >
        <div className="gx-entry-balance">
          <span>{appShellCopy.initialPrompt}</span>
          <strong>연결 준비</strong>
        </div>

        <form
          action="/api/auth/demo-login"
          className="gx-entry-form"
          method="post"
        >
          <button className="gx-entry-primary" type="submit">
            {appShellCopy.primaryAction}
          </button>
        </form>

        <div className="gx-entry-list" aria-label="진행 상태">
          {todayQueue.map((item) => (
            <div className="gx-entry-row" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </MobileShell>
    </main>
  )
}
