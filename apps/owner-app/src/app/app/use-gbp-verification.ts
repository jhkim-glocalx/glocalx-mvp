"use client"

import { useCallback, useState } from "react"

import type {
  GbpVerificationOwnerPhase,
  GbpVerificationState,
} from "@glocalx/domain/gbp-verification-state"

export type OwnerGbpVerification = {
  readonly state: GbpVerificationState
  readonly phase: GbpVerificationOwnerPhase
  readonly offeredMethods: readonly string[]
  readonly updatedAt: string
}

export type GbpVerificationUiState =
  | { readonly kind: "idle" }
  // The owner has not created a GBP listing yet, so there is no verification.
  | { readonly kind: "none" }
  | { readonly kind: "loaded"; readonly verification: OwnerGbpVerification }

type VerificationResponse = {
  readonly verification: OwnerGbpVerification | null
}

// Fetches on the nav-click into the onboarding section, never on mount — the same
// convention useGbpAccess follows. The GET route runs the read-only on-view
// refresh server-side, so a plain fetch here surfaces any async grant/denial.
export function useGbpVerification(): {
  readonly state: GbpVerificationUiState
  readonly refresh: () => Promise<void>
} {
  const [state, setState] = useState<GbpVerificationUiState>({ kind: "idle" })

  const refresh = useCallback(async () => {
    let payload: VerificationResponse
    try {
      const response = await fetch("/api/gbp/verification")
      if (!response.ok) {
        return
      }
      payload = (await response.json()) as VerificationResponse
    } catch {
      // Keep the prior state on a transient failure rather than flashing an error.
      return
    }
    setState(
      payload.verification === null
        ? { kind: "none" }
        : { kind: "loaded", verification: payload.verification }
    )
  }, [])

  return { state, refresh }
}
