import { redirect } from "next/navigation"

import { getDemoSession } from "@/auth/server-session"

export default async function OnboardingPage() {
  const session = await getDemoSession()

  if (session === undefined) {
    redirect("/")
  }

  if (session.onboardingComplete) {
    redirect("/app")
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col justify-between gap-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm sm:p-8">
        <div>
          <p className="text-sm font-semibold text-[var(--primary)]">GlocalX</p>
          <h1 className="mt-4 text-2xl font-bold text-[var(--foreground)]">
            가게 정보를 설정해드릴게요
          </h1>
          <p className="mt-4 text-base leading-7 text-[var(--muted)]">
            가게 상호명 또는 네이버 플레이스 링크를 입력해주세요.
          </p>
        </div>

        <form
          action="/api/onboarding/complete"
          className="grid gap-3"
          method="post"
        >
          <label className="grid gap-2 text-sm font-semibold text-[var(--foreground)]">
            네이버 정보
            <input
              className="rounded-md border border-[var(--border)] px-3 py-3 text-sm outline-none focus:border-[var(--primary)]"
              name="naverInput"
              placeholder="https://naver.me/mybrunchcafe"
              type="text"
            />
          </label>
          <button className="rounded-md bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)]">
            온보딩 완료
          </button>
        </form>
      </section>
    </main>
  )
}
