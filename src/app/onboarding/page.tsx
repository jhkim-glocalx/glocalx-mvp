import { redirect } from "next/navigation"

import { getDemoSession } from "@/auth/server-session"
import { OnboardingFlow } from "./onboarding-flow"

export default async function OnboardingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly resume?: string | readonly string[] | undefined
  }>
}) {
  const session = await getDemoSession()

  if (session === undefined) {
    redirect("/")
  }

  if (session.onboardingComplete) {
    redirect("/app")
  }

  const { resume } = await searchParams
  return <OnboardingFlow resumeGbpSetup={resume === "gbp"} />
}
