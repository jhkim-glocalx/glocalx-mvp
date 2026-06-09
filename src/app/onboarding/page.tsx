import { redirect } from "next/navigation"

import { getDemoSession } from "@/auth/server-session"
import { OnboardingFlow } from "./onboarding-flow"

export default async function OnboardingPage() {
  const session = await getDemoSession()

  if (session === undefined) {
    redirect("/")
  }

  if (session.onboardingComplete) {
    redirect("/app")
  }

  return <OnboardingFlow />
}
