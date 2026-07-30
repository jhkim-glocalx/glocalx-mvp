"use client"

import { useCallback, useState } from "react"

import type { GbpAccessOwnerPhase } from "@glocalx/domain/gbp-access"

export type OwnerGbpAccess = {
  readonly state: string
  readonly phase: GbpAccessOwnerPhase
  readonly updatedAt: string
}

export type GbpAccessUiState =
  | { readonly kind: "idle" }
  // The owner has not completed GBP connect, so there is no request to show.
  | { readonly kind: "none" }
  | { readonly kind: "loaded"; readonly access: OwnerGbpAccess }

type AccessResponse = {
  readonly access: OwnerGbpAccess | null
}

// Fetches on an explicit action (the nav-click into the onboarding section),
// never on mount — the same house convention the campaign and onboarding hooks
// follow, which keeps the react-hooks/set-state-in-effect rule happy.
export function useGbpAccess(): {
  readonly state: GbpAccessUiState
  readonly refresh: () => Promise<void>
} {
  const [state, setState] = useState<GbpAccessUiState>({ kind: "idle" })

  const refresh = useCallback(async () => {
    let payload: AccessResponse
    try {
      const response = await fetch("/api/gbp/access")
      if (!response.ok) {
        return
      }
      payload = (await response.json()) as AccessResponse
    } catch {
      // A transient fetch failure leaves the prior state in place rather than
      // flashing an error over a status the owner was already reading.
      return
    }
    setState(
      payload.access === null
        ? { kind: "none" }
        : { kind: "loaded", access: payload.access }
    )
  }, [])

  return { state, refresh }
}
