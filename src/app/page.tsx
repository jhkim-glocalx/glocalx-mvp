import { appShellCopy } from "@/lib/app-shell"

const proofItems = [
  "네이버 정보 추출",
  "Google Business Profile 세팅",
  "GBP 홍보글 초안과 게시",
] as const

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-center">
        <div className="grid gap-8">
          <div className="flex items-center gap-4">
            <div className="gx-brand-mark">X</div>
            <div>
              <p className="text-sm font-black text-[var(--accent)]">
                {appShellCopy.productName}
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                AI Global Marketing Agency
              </p>
            </div>
          </div>

          <div className="max-w-3xl">
            <h1 className="text-5xl font-black leading-[1.02] text-white sm:text-7xl">
              혼자서도
              <br />전 세계에 팝니다.
            </h1>
            <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-white/68">
              {appShellCopy.supportingText}
            </p>
          </div>

          <form
            action="/api/auth/demo-login"
            className="flex max-w-xl flex-col gap-3 sm:flex-row"
            method="post"
          >
            <button
              className="rounded-2xl bg-[var(--accent)] px-5 py-4 text-sm font-black text-white transition hover:bg-[var(--accent-press)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-[rgba(255,106,61,0.35)]"
              type="submit"
            >
              {appShellCopy.primaryAction}
            </button>
            <button
              className="rounded-2xl border border-white/12 px-5 py-4 text-sm font-black text-white/42"
              disabled
              type="button"
            >
              카카오 준비중
            </button>
            <button
              className="rounded-2xl border border-white/12 px-5 py-4 text-sm font-black text-white/42"
              disabled
              type="button"
            >
              이메일 준비중
            </button>
          </form>
        </div>

        <div className="gx-phone">
          <div className="gx-phone-screen justify-between">
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-[var(--ink-soft)]">
                  GlocalX
                </span>
                <span className="rounded-full bg-[var(--mint-soft)] px-3 py-1 text-xs font-black text-[var(--mint)]">
                  Stub mode
                </span>
              </div>
              <div className="gx-bubble" data-speaker="assistant">
                사장님 가게 정보부터 GBP 게시까지, 지금 개발된 흐름만 바로
                연결해볼게요.
              </div>
              <div className="grid gap-3">
                {proofItems.map((item) => (
                  <div className="gx-status-card" data-status="success" key={item}>
                    <span className="text-xs font-bold text-[var(--ink-soft)]">
                      준비됨
                    </span>
                    <strong>{item}</strong>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs font-semibold leading-5 text-[var(--muted)]">
              카카오와 이메일 로그인은 데모에서 쿠키를 만들지 않습니다.
            </p>
          </div>
        </div>
      </section>
    </main>
  )
}
