import { appShellCopy } from "@/lib/app-shell"

const readinessItems = [
  "Next.js App Router",
  "TypeScript strict mode",
  "Tailwind CSS",
  "Vitest",
  "Playwright",
] as const

export default function Home() {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col justify-between gap-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[var(--primary)]">
            {appShellCopy.productName}
          </p>
          <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
            Stub mode
          </span>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold leading-tight text-[var(--foreground)] sm:text-5xl">
              {appShellCopy.productName}
            </h1>
            <p className="mt-4 text-xl font-semibold text-[var(--foreground)]">
              {appShellCopy.initialPrompt}
            </p>
            <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">
              {appShellCopy.supportingText}
            </p>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[#f9fbf8] p-4">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              품질 게이트
            </p>
            <ul className="mt-3 grid gap-2">
              {readinessItems.map((item) => (
                <li
                  className="flex items-center gap-2 text-sm text-[var(--muted)]"
                  key={item}
                >
                  <span className="h-2 w-2 rounded-full bg-[var(--primary)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button className="rounded-md bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)]">
            {appShellCopy.primaryAction}
          </button>
          <button className="rounded-md border border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--accent)] transition hover:border-[var(--accent)]">
            {appShellCopy.secondaryAction}
          </button>
        </div>
      </section>
    </main>
  )
}
