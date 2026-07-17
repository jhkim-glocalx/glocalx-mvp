import { redirect } from "next/navigation"

import { getDemoSession } from "@/auth/server-session"
import { appNavIdFromSearchParam } from "./app-workspace-model"
import { AppWorkspace } from "./app-workspace"

export default async function AppPage({ searchParams }: PageProps<"/app">) {
  const params = await searchParams
  const session = await getDemoSession()

  if (session === undefined) {
    redirect("/")
  }

  if (!session.onboardingComplete) {
    redirect("/onboarding")
  }

  return (
    <AppWorkspace
      initialNavId={appNavIdFromSearchParam(params["nav"])}
      storeId={session.storeId}
    />
  )
}
