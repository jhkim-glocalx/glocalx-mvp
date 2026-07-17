"use client"

import { useCallback, useEffect, useRef } from "react"

import {
  activityFlushMaxEvents,
  activityTrailMaxEntries,
} from "@glocalx/domain/support/contracts"
import type {
  ActivityAction,
  ActivityDetail,
  ActivityEventEntry,
  ActivitySection,
  ActivityTrail,
} from "@glocalx/domain/support/contracts"

const flushIntervalMs = 15000
// Bound the unsent queue so a long offline stretch can't grow it without
// limit; telemetry is best-effort, so dropping the oldest is acceptable.
const maxPendingEvents = 200

export type ActivityRecorder = {
  readonly recordAction: (
    section: ActivitySection,
    action: ActivityAction,
    detail?: ActivityDetail
  ) => void
  readonly getTrail: () => ActivityTrail
  readonly flushNow: () => void
}

// Client ring buffer for owner activity (architecture §2): the recent trail
// travels with each chat message as context, and the full stream is flushed
// periodically to activity_events for the operator store timeline.
export function useActivityTrail(): ActivityRecorder {
  const recentRef = useRef<ActivityEventEntry[]>([])
  const pendingRef = useRef<ActivityEventEntry[]>([])
  const flushingRef = useRef(false)

  const flushNow = useCallback((): void => {
    if (flushingRef.current || pendingRef.current.length === 0) {
      return
    }
    const batch = pendingRef.current.slice(0, activityFlushMaxEvents)
    pendingRef.current = pendingRef.current.slice(activityFlushMaxEvents)
    flushingRef.current = true

    void (async () => {
      try {
        const response = await fetch("/api/activity/flush", {
          body: JSON.stringify({ events: batch }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
        if (!response.ok) {
          // Requeue the batch ahead of newer events so ordering survives a retry.
          pendingRef.current = [...batch, ...pendingRef.current]
        }
      } catch {
        pendingRef.current = [...batch, ...pendingRef.current]
      } finally {
        flushingRef.current = false
      }
    })()
  }, [])

  const recordAction = useCallback<ActivityRecorder["recordAction"]>(
    (section, action, detail) => {
      const entry: ActivityEventEntry = {
        action,
        occurredAt: new Date().toISOString(),
        section,
        ...(detail === undefined ? {} : { detail }),
      }
      recentRef.current = [...recentRef.current, entry].slice(
        -activityTrailMaxEntries
      )
      pendingRef.current = [...pendingRef.current, entry].slice(
        -maxPendingEvents
      )
    },
    []
  )

  const getTrail = useCallback<ActivityRecorder["getTrail"]>(
    () => recentRef.current.slice(-activityTrailMaxEntries),
    []
  )

  useEffect(() => {
    const timer = setInterval(flushNow, flushIntervalMs)
    return () => {
      clearInterval(timer)
      // Best-effort final flush when the surface unmounts.
      flushNow()
    }
  }, [flushNow])

  return { flushNow, getTrail, recordAction }
}
