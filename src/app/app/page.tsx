import { redirect } from "next/navigation"

import { getDemoSession } from "@/auth/server-session"
import { AppWorkspace } from "./app-workspace"

export default async function AppPage() {
  const session = await getDemoSession()

  if (session === undefined) {
    redirect("/")
  }

  if (!session.onboardingComplete) {
    redirect("/onboarding")
  }

  return <AppWorkspace />
}
