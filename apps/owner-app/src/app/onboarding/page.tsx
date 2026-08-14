import { redirect } from "next/navigation"

import { MobileShell } from "@/app/_components/mobile-shell"
import { getDemoSession } from "@/auth/server-session"
import { readInstagramConnectResult } from "@/instagram/connect-result"
import { instagramConnectResultParam } from "@/instagram/oauth-link"
import { openDatabaseContext } from "@glocalx/db"
import { createDatabaseStoreChannelLinkStore } from "@/server/repositories/store-channel-link-store"

import { InstagramConnectResultPanel } from "./onboarding-instagram-panels"
import { OnboardingFlow } from "./onboarding-flow"
import { OnboardingTopBar } from "./onboarding-panels"

async function readInstagramAccountNames(storeId: string) {
  const databaseContext = await openDatabaseContext()
  try {
    return await createDatabaseStoreChannelLinkStore(
      databaseContext.queryable
    ).readAccountNames({ channel: "instagram", storeId })
  } finally {
    await databaseContext.close()
  }
}

export default async function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding">) {
  const session = await getDemoSession()

  if (session === undefined) {
    redirect("/")
  }

  if (session.onboardingComplete) {
    redirect("/app")
  }

  // Meta's consent screen is a full page navigation, so the owner returns here
  // on a cold load with the in-memory chat state gone. Rather than dropping
  // them back at the top of onboarding, the connect result is its own terminal
  // screen carrying the same "finish onboarding" action the chat flow ends with.
  const params = await searchParams
  const connectResult = readInstagramConnectResult(
    params[instagramConnectResultParam]
  )
  if (connectResult !== undefined) {
    const accountNames =
      session.storeId === ""
        ? undefined
        : await readInstagramAccountNames(session.storeId)
    return (
      <main className="gx-route-page">
        <MobileShell topBar={<OnboardingTopBar />}>
          <InstagramConnectResultPanel
            linkedAccountUsername={accountNames?.linkedAccountUsername}
            requestedAccountHandle={accountNames?.requestedAccountHandle}
            result={connectResult}
          />
        </MobileShell>
      </main>
    )
  }

  return <OnboardingFlow />
}
