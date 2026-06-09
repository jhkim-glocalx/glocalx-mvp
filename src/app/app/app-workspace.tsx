"use client"

import { useState, type FormEvent } from "react"

import { BottomNav } from "@/app/_components/bottom-nav"
import { MobileShell } from "@/app/_components/mobile-shell"

import {
  appNavItems,
  parseDraftState,
  parsePublishState,
  type AppNavId,
  type DraftState,
  type PublishState,
} from "./app-workspace-model"
import { AppWorkspaceTopBar } from "./app-workspace-topbar"
import { PerformanceDashboard } from "./performance-dashboard"
import { PostPanel } from "./app-workspace-post-panel"

type AppWorkspaceProps = {
  readonly storeId: string
}

const draftNetworkErrorMessage =
  "초안 생성 요청을 완료하지 못했습니다. 잠시 후 다시 시도해주세요."
const publishNetworkErrorMessage =
  "게시 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요."

export function AppWorkspace({ storeId }: AppWorkspaceProps) {
  const [activeNavId, setActiveNavId] = useState<AppNavId>("home")
  const [draft, setDraft] = useState<DraftState>({ kind: "idle" })
  const [intent, setIntent] = useState("주말 브런치 신메뉴 홍보")
  const [submittedIntent, setSubmittedIntent] = useState<string>()
  const [publish, setPublish] = useState<PublishState>({ kind: "idle" })

  function handleNavChange(navId: string) {
    if (navId === "home" || navId === "post" || navId === "insights") {
      setActiveNavId(navId)
    }
  }

  async function handleDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmittedIntent(intent)
    setDraft({ kind: "loading" })
    setPublish({ kind: "idle" })

    try {
      const response = await fetch("/api/posts/drafts", {
        body: JSON.stringify({
          ownerIntent: intent,
          storeId,
          targetChannel: "GBP",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      setDraft(parseDraftState(payload))
    } catch {
      setDraft({
        kind: "error",
        message: draftNetworkErrorMessage,
      })
    }
  }

  async function handlePublish() {
    if (draft.kind !== "ready") {
      return
    }

    setPublish({ kind: "loading" })
    try {
      const response = await fetch(`/api/posts/${draft.draftId}/publish`, {
        body: JSON.stringify({ storeId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const payload: unknown = await response.json()
      setPublish(parsePublishState(payload))
    } catch {
      setPublish({
        kind: "blocked",
        message: publishNetworkErrorMessage,
      })
    }
  }

  return (
    <main className="gx-route-page">
      <MobileShell
        bottomNav={
          <BottomNav
            activeId={activeNavId}
            items={appNavItems}
            onSelect={handleNavChange}
          />
        }
        testId="app-stage"
        topBar={<AppWorkspaceTopBar />}
      >
        {activeNavId === "home" ? (
          <PerformanceDashboard variant="summary" />
        ) : null}
        {activeNavId === "post" ? (
          <PostPanel
            draft={draft}
            intent={intent}
            onDraft={handleDraft}
            onIntentChange={setIntent}
            onPublish={handlePublish}
            publish={publish}
            submittedIntent={submittedIntent}
          />
        ) : null}
        {activeNavId === "insights" ? (
          <PerformanceDashboard variant="details" />
        ) : null}
      </MobileShell>
    </main>
  )
}
