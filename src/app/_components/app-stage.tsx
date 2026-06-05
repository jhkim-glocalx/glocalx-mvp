import type { ReactNode } from "react"

type AppStageProps = {
  readonly children: ReactNode
  readonly navigation: ReactNode
}

export function AppStage({ children, navigation }: AppStageProps) {
  return (
    <main className="min-h-screen">
      <section className="gx-stage" data-testid="app-stage">
        <aside className="gx-panel p-4 sm:p-5">{navigation}</aside>
        <div className="gx-panel p-3 sm:p-5">{children}</div>
      </section>
    </main>
  )
}
