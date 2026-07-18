import { describe, expect, it } from "vitest"

import {
  computeMedianOwnerResponseTimeMs,
  computeOwnerInitiatedConversationCount,
  computeWeeklyActivation,
  computeWeeklyKillMetrics,
  lastSevenDayWindow,
  type MetricsActivityEvent,
  type MetricsConversation,
  type MetricsMessage,
  type WeeklyMetricsWindow,
} from "./metrics"

const window: WeeklyMetricsWindow = {
  start: "2026-07-06T00:00:00.000Z",
  end: "2026-07-13T00:00:00.000Z",
}

describe("computeWeeklyActivation", () => {
  it("counts distinct in-window stores", () => {
    const events: MetricsActivityEvent[] = [
      { storeId: "store-a", occurredAt: "2026-07-06T09:00:00.000Z" },
      { storeId: "store-a", occurredAt: "2026-07-07T09:00:00.000Z" },
      { storeId: "store-b", occurredAt: "2026-07-08T09:00:00.000Z" },
    ]
    expect(computeWeeklyActivation(events, window)).toBe(2)
  })

  it("excludes events outside the half-open window", () => {
    const events: MetricsActivityEvent[] = [
      { storeId: "store-before", occurredAt: "2026-07-05T23:59:59.999Z" },
      { storeId: "store-at-end", occurredAt: window.end },
      { storeId: "store-in", occurredAt: window.start },
    ]
    expect(computeWeeklyActivation(events, window)).toBe(1)
  })
})

describe("computeOwnerInitiatedConversationCount", () => {
  it("counts conversations opened in the window", () => {
    const conversations: MetricsConversation[] = [
      { createdAt: "2026-07-06T00:00:00.000Z" },
      { createdAt: "2026-07-10T12:00:00.000Z" },
      { createdAt: "2026-07-05T12:00:00.000Z" },
      { createdAt: window.end },
    ]
    expect(computeOwnerInitiatedConversationCount(conversations, window)).toBe(
      2
    )
  })
})

describe("computeMedianOwnerResponseTimeMs", () => {
  it("measures latency from the preceding assistant message", () => {
    const messages: MetricsMessage[] = [
      {
        conversationId: "c1",
        sender: "assistant",
        createdAt: "2026-07-07T10:00:00.000Z",
      },
      {
        conversationId: "c1",
        sender: "owner",
        createdAt: "2026-07-07T10:05:00.000Z",
      },
    ]
    expect(computeMedianOwnerResponseTimeMs(messages, window)).toBe(5 * 60_000)
  })

  it("averages the two central latencies for an even count", () => {
    const messages: MetricsMessage[] = [
      // c1: 2-minute response.
      {
        conversationId: "c1",
        sender: "assistant",
        createdAt: "2026-07-07T10:00:00.000Z",
      },
      {
        conversationId: "c1",
        sender: "owner",
        createdAt: "2026-07-07T10:02:00.000Z",
      },
      // c2: 4-minute response.
      {
        conversationId: "c2",
        sender: "assistant",
        createdAt: "2026-07-08T10:00:00.000Z",
      },
      {
        conversationId: "c2",
        sender: "owner",
        createdAt: "2026-07-08T10:04:00.000Z",
      },
    ]
    expect(computeMedianOwnerResponseTimeMs(messages, window)).toBe(3 * 60_000)
  })

  it("ignores owner messages not preceded by an assistant message", () => {
    const messages: MetricsMessage[] = [
      // Owner opens (no preceding assistant) then follows up — neither is a
      // response to the assistant.
      {
        conversationId: "c1",
        sender: "owner",
        createdAt: "2026-07-07T10:00:00.000Z",
      },
      {
        conversationId: "c1",
        sender: "owner",
        createdAt: "2026-07-07T10:01:00.000Z",
      },
    ]
    expect(computeMedianOwnerResponseTimeMs(messages, window)).toBeNull()
  })

  it("attributes a pair by the owner reply timestamp, not the prompt", () => {
    const messages: MetricsMessage[] = [
      // Assistant prompted before the window; owner replied inside it.
      {
        conversationId: "c1",
        sender: "assistant",
        createdAt: "2026-07-05T23:00:00.000Z",
      },
      {
        conversationId: "c1",
        sender: "owner",
        createdAt: "2026-07-06T00:30:00.000Z",
      },
    ]
    expect(computeMedianOwnerResponseTimeMs(messages, window)).toBe(90 * 60_000)
  })

  it("returns null when no pairs fall in the window", () => {
    expect(computeMedianOwnerResponseTimeMs([], window)).toBeNull()
  })

  it("does not cross conversations when pairing", () => {
    const messages: MetricsMessage[] = [
      {
        conversationId: "c1",
        sender: "assistant",
        createdAt: "2026-07-07T10:00:00.000Z",
      },
      {
        conversationId: "c2",
        sender: "owner",
        createdAt: "2026-07-07T10:01:00.000Z",
      },
    ]
    expect(computeMedianOwnerResponseTimeMs(messages, window)).toBeNull()
  })
})

describe("computeWeeklyKillMetrics", () => {
  it("assembles all three metrics for the window", () => {
    const metrics = computeWeeklyKillMetrics({
      window,
      activityEvents: [
        { storeId: "store-a", occurredAt: "2026-07-06T09:00:00.000Z" },
        { storeId: "store-b", occurredAt: "2026-07-07T09:00:00.000Z" },
      ],
      messages: [
        {
          conversationId: "c1",
          sender: "assistant",
          createdAt: "2026-07-07T10:00:00.000Z",
        },
        {
          conversationId: "c1",
          sender: "owner",
          createdAt: "2026-07-07T10:03:00.000Z",
        },
      ],
      conversations: [{ createdAt: "2026-07-07T09:59:00.000Z" }],
    })

    expect(metrics).toEqual({
      window,
      activation: 2,
      medianOwnerResponseTimeMs: 3 * 60_000,
      ownerInitiatedConversationCount: 1,
    })
  })
})

describe("lastSevenDayWindow", () => {
  it("spans the 7 days ending at now (exclusive)", () => {
    const now = new Date("2026-07-13T00:00:00.000Z")
    expect(lastSevenDayWindow(now)).toEqual({
      start: "2026-07-06T00:00:00.000Z",
      end: "2026-07-13T00:00:00.000Z",
    })
  })
})
