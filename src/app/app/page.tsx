import { redirect } from "next/navigation"

import { getDemoSession } from "@/auth/server-session"

export default async function AppPage() {
  const session = await getDemoSession()

  if (session === undefined) {
    redirect("/")
  }

  if (!session.onboardingComplete) {
    redirect("/onboarding")
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col gap-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm sm:p-8">
        <div>
          <p className="text-sm font-semibold text-[var(--primary)]">GlocalX</p>
          <h1 className="mt-4 text-2xl font-bold text-[var(--foreground)]">
            GlocalX 대시보드
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">
            데모 매장 컨텍스트가 연결되었습니다.
          </p>
        </div>
      </section>
    </main>
  )
}
