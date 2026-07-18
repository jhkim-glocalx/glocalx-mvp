import type { CsMessageSender } from "./chat"

// Premise-2 kill metrics (design-decisions.md §Premises/2). These decide, at
// week 4, whether in-app chat beats KakaoTalk for CS — so the definitions are
// pinned here and unit-tested against fixtures: a silently wrong metric
// corrupts a strategic go/no-go. Sources per the design doc:
//   - activity_events  → weekly activation
//   - cs_messages      → median owner response time (the KILL-THRESHOLD metric)
//   - cs_conversations → owner-initiated conversation count
// activation and owner-initiated count are context-only signals; median owner
// response time is the one compared against the Kakao baseline (~2x threshold).

// Half-open window [start, end): an event at exactly `end` belongs to the next
// window, so adjacent weeks never double-count a boundary event.
export type WeeklyMetricsWindow = {
  readonly start: string
  readonly end: string
}

export type MetricsActivityEvent = {
  readonly storeId: string
  readonly occurredAt: string
}

export type MetricsMessage = {
  readonly conversationId: string
  readonly sender: CsMessageSender
  readonly createdAt: string
}

export type MetricsConversation = {
  readonly createdAt: string
}

export type WeeklyKillMetricsInput = {
  readonly window: WeeklyMetricsWindow
  readonly activityEvents: readonly MetricsActivityEvent[]
  readonly messages: readonly MetricsMessage[]
  readonly conversations: readonly MetricsConversation[]
}

export type WeeklyKillMetrics = {
  readonly window: WeeklyMetricsWindow
  readonly activation: number
  // Null when the window contains no owner reply to respond-to — an absent
  // signal is not zero latency, and the consumer must render it as "no data".
  readonly medianOwnerResponseTimeMs: number | null
  readonly ownerInitiatedConversationCount: number
}

function isWithinWindow(
  timestamp: string,
  window: WeeklyMetricsWindow
): boolean {
  return timestamp >= window.start && timestamp < window.end
}

// Weekly activation: distinct stores with any recorded activity in the window.
// "Did this store use the app this week at all", the broadest engagement signal.
export function computeWeeklyActivation(
  activityEvents: readonly MetricsActivityEvent[],
  window: WeeklyMetricsWindow
): number {
  const activeStores = new Set<string>()
  for (const event of activityEvents) {
    if (isWithinWindow(event.occurredAt, window)) {
      activeStores.add(event.storeId)
    }
  }
  return activeStores.size
}

// Owner-initiated conversation count: conversations opened in the window. In
// Phase 1 the owner always sends first, so every conversation is owner-
// initiated; the metric therefore counts conversation creations in-window.
export function computeOwnerInitiatedConversationCount(
  conversations: readonly MetricsConversation[],
  window: WeeklyMetricsWindow
): number {
  let count = 0
  for (const conversation of conversations) {
    if (isWithinWindow(conversation.createdAt, window)) {
      count += 1
    }
  }
  return count
}

// Median owner response time: for each owner message that directly answers an
// assistant message (the immediately preceding message in the same
// conversation is from the assistant), the latency is
// owner.createdAt − assistant.createdAt. We attribute a pair to the window by
// the OWNER reply timestamp — the assistant prompt may predate the window — so
// a week measures how fast the owner replied that week. Median across all such
// pairs; even counts average the two central values. Null when no pairs land
// in the window.
export function computeMedianOwnerResponseTimeMs(
  messages: readonly MetricsMessage[],
  window: WeeklyMetricsWindow
): number | null {
  const latencies = collectOwnerResponseLatenciesMs(messages, window)
  if (latencies.length === 0) {
    return null
  }
  latencies.sort((left, right) => left - right)
  const middle = Math.floor(latencies.length / 2)
  if (latencies.length % 2 === 1) {
    return latencies[middle] ?? null
  }
  const lower = latencies[middle - 1]
  const upper = latencies[middle]
  if (lower === undefined || upper === undefined) {
    return null
  }
  return (lower + upper) / 2
}

function collectOwnerResponseLatenciesMs(
  messages: readonly MetricsMessage[],
  window: WeeklyMetricsWindow
): number[] {
  const byConversation = new Map<string, MetricsMessage[]>()
  for (const message of messages) {
    const bucket = byConversation.get(message.conversationId)
    if (bucket === undefined) {
      byConversation.set(message.conversationId, [message])
    } else {
      bucket.push(message)
    }
  }

  const latencies: number[] = []
  for (const conversationMessages of byConversation.values()) {
    // Chronological within the conversation; createdAt then a stable-ish scan.
    conversationMessages.sort((left, right) =>
      left.createdAt < right.createdAt
        ? -1
        : left.createdAt > right.createdAt
          ? 1
          : 0
    )
    for (let index = 1; index < conversationMessages.length; index += 1) {
      const previous = conversationMessages[index - 1]
      const current = conversationMessages[index]
      if (
        previous === undefined ||
        current === undefined ||
        previous.sender !== "assistant" ||
        current.sender !== "owner" ||
        !isWithinWindow(current.createdAt, window)
      ) {
        continue
      }
      const latency =
        Date.parse(current.createdAt) - Date.parse(previous.createdAt)
      if (Number.isFinite(latency) && latency >= 0) {
        latencies.push(latency)
      }
    }
  }
  return latencies
}

export function computeWeeklyKillMetrics(
  input: WeeklyKillMetricsInput
): WeeklyKillMetrics {
  return {
    window: input.window,
    activation: computeWeeklyActivation(input.activityEvents, input.window),
    medianOwnerResponseTimeMs: computeMedianOwnerResponseTimeMs(
      input.messages,
      input.window
    ),
    ownerInitiatedConversationCount: computeOwnerInitiatedConversationCount(
      input.conversations,
      input.window
    ),
  }
}

// A week window ending at `now` (exclusive), starting 7 days earlier.
export function lastSevenDayWindow(now: Date): WeeklyMetricsWindow {
  const end = now.toISOString()
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  return { start, end }
}
