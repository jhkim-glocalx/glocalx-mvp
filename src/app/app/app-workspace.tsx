"use client"

import { useState } from "react"

import { MobileShell } from "@/app/_components/mobile-shell"
import { ReferenceComposer } from "@/app/_components/reference-composer"

import {
  appNavItems,
  parsePublishState,
  type AppNavId,
  type PublishState,
} from "./app-workspace-model"
import { AppWorkspaceTopBar } from "./app-workspace-topbar"
import { ReferenceFlowScreens } from "./reference-flow-screens"

type AppWorkspaceProps = {
  readonly storeId: string
}

const publishNetworkErrorMessage =
  "게시 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요."

export function AppWorkspace({ storeId }: AppWorkspaceProps) {
  const [activeNavId, setActiveNavId] = useState<AppNavId>("photo")
  const [publish, setPublish] = useState<PublishState>({ kind: "idle" })

  function handleNavChange(navId: string) {
    if (appNavItems.some((item) => item.id === navId)) {
      setActiveNavId(navId as AppNavId)
    }
  }

  async function handlePublish() {
    setPublish({ kind: "loading" })
    try {
      const response = await fetch("/api/posts/demo-post-draft/publish", {
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
        bottomBar={activeNavId === "dashboard" ? undefined : <ReferenceComposer />}
        key={activeNavId}
        screenClassName={
          activeNavId === "dashboard" ? "gx-dashboard-screen" : "gx-chat-screen"
        }
        testId="app-stage"
        topBar={activeNavId === "dashboard" ? undefined : <AppWorkspaceTopBar />}
      >
        <ReferenceFlowScreens
          activeNavId={activeNavId}
          onPublish={handlePublish}
          onSelect={handleNavChange}
          publish={publish}
        />
      </MobileShell>
    </main>
  )
}
