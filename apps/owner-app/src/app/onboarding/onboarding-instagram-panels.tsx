"use client"

import { useState } from "react"

import { ChatMessage } from "@/app/_components/chat-message"
import { StatusCard } from "@/app/_components/status-card"
import type { InstagramConnectResult } from "@/instagram/oauth-link"

import { QuickReplyButton } from "./onboarding-components"

type ConnectStep = "asking" | "handle" | "skipped"

function CompleteOnboardingForm({ label }: { readonly label: string }) {
  return (
    <form
      action="/api/onboarding/complete"
      className="grid gap-3"
      method="post"
    >
      <button className="gx-onboarding-primary" type="submit">
        {label}
      </button>
    </form>
  )
}

/**
 * Takes the owner's Instagram account name and posts it to the connect start
 * route.
 *
 * A real form POST rather than fetch: the start route answers with a 303 to
 * Instagram's hosted consent page, which the browser has to follow as a
 * top-level navigation (Meta renders it in neither an iframe nor an XHR). That
 * navigation is also why the owner comes back on a fresh page load — the
 * outcome is rendered by InstagramConnectResultPanel, not by this component.
 */
function InstagramHandleForm({
  defaultHandle,
  emphasis,
  submitLabel,
}: {
  readonly defaultHandle: string
  // On the result screen this form is the *second* action, behind "finish
  // onboarding" — filling both buttons would leave the owner no visual answer
  // to "which one moves me forward?".
  readonly emphasis: "primary" | "secondary"
  readonly submitLabel: string
}) {
  const [accountHandle, setAccountHandle] = useState(defaultHandle)

  return (
    <form
      action="/api/instagram/oauth/start"
      className="gx-onboarding-form"
      method="post"
    >
      <label className="grid gap-2 text-sm font-black text-[var(--ink)]">
        인스타그램 계정
        <input
          autoCapitalize="none"
          autoCorrect="off"
          className="gx-onboarding-input"
          name="accountHandle"
          onChange={(event) => setAccountHandle(event.currentTarget.value)}
          placeholder="@우리가게 또는 프로필 주소"
          required
          type="text"
          value={accountHandle}
        />
      </label>
      <button
        className={
          emphasis === "primary"
            ? "gx-onboarding-primary"
            : "gx-onboarding-secondary"
        }
        type="submit"
      >
        {submitLabel}
      </button>
    </form>
  )
}

export function InstagramConnectPanel() {
  const [step, setStep] = useState<ConnectStep>("asking")

  if (step === "skipped") {
    return (
      <div className="grid gap-3">
        <ChatMessage
          message="알겠어요. 인스타그램은 나중에 언제든 연결할 수 있어요."
          speaker="assistant"
        />
        <CompleteOnboardingForm label="매장 홍보 처음 시키러 가기" />
      </div>
    )
  }

  if (step === "handle") {
    return (
      <div className="grid gap-3">
        <ChatMessage
          message="인스타그램 계정 이름을 알려주세요. 그 계정으로 권한 승인 링크를 만들어 드릴게요."
          speaker="assistant"
        />
        <InstagramHandleForm
          defaultHandle=""
          emphasis="primary"
          submitLabel="인스타그램에서 권한 승인하기"
        />
        <div className="flex flex-wrap gap-2">
          <QuickReplyButton onClick={() => setStep("skipped")}>
            나중에 할게요
          </QuickReplyButton>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <ChatMessage
        message="인스타그램 계정도 운영하고 계신가요? 연결해두면 같은 홍보글을 인스타에도 올려드려요."
        speaker="assistant"
      />
      <button
        className="gx-onboarding-primary"
        onClick={() => setStep("handle")}
        type="button"
      >
        네, 연결할게요
      </button>
      <div className="flex flex-wrap gap-2">
        <QuickReplyButton onClick={() => setStep("skipped")}>
          아니요, 없어요
        </QuickReplyButton>
      </div>
    </div>
  )
}

const resultCopy: Record<
  InstagramConnectResult,
  { readonly message: string; readonly retryLabel: string | undefined }
> = {
  connected: {
    message: "인스타그램 계정을 연결했어요. 이제 인스타에도 함께 올려드릴게요.",
    retryLabel: undefined,
  },
  connected_other_account: {
    message:
      "말씀하신 계정과 다른 인스타그램 계정으로 로그인하셨어요. 이 계정이 맞다면 그대로 진행하시고, 아니라면 다시 연결해주세요.",
    retryLabel: "다른 계정으로 다시 연결",
  },
  needs_professional_account: {
    message:
      "이 계정은 개인 계정이라 자동 게시를 할 수 없어요. 인스타그램 앱에서 프로페셔널(비즈니스) 계정으로 전환한 뒤 다시 연결해주세요.",
    retryLabel: "전환 후 다시 연결",
  },
  error: {
    message:
      "인스타그램 연결에 실패했어요. 잠시 후 다시 시도하거나, 나중에 연결하셔도 괜찮아요.",
    retryLabel: "다시 연결",
  },
}

// The owner returns from Meta on a fresh page load, so this panel is the whole
// screen rather than another bubble appended to a live conversation. It always
// offers the way forward — a failed Instagram connect must never strand an
// owner whose GBP setup already succeeded.
export function InstagramConnectResultPanel({
  linkedAccountUsername,
  requestedAccountHandle,
  result,
}: {
  // Shown only when the authorization returned a name — it is the only way the
  // owner can tell *which* account got connected, since the reference the
  // publish path stores is a numeric Instagram user id.
  readonly linkedAccountUsername: string | undefined
  readonly requestedAccountHandle: string | undefined
  readonly result: InstagramConnectResult
}) {
  const copy = resultCopy[result]

  return (
    <div className="grid gap-3">
      <div {...(result === "connected" ? {} : { role: "alert" })}>
        <ChatMessage message={copy.message} speaker="assistant" />
      </div>
      {linkedAccountUsername === undefined ? null : (
        <StatusCard
          label="연결된 인스타그램 계정"
          status={result === "connected" ? "success" : "warning"}
          value={`@${linkedAccountUsername}`}
        />
      )}
      {copy.retryLabel === undefined ? null : (
        <InstagramHandleForm
          defaultHandle={requestedAccountHandle ?? ""}
          emphasis="secondary"
          submitLabel={copy.retryLabel}
        />
      )}
      <CompleteOnboardingForm label="매장 홍보 처음 시키러 가기" />
    </div>
  )
}
