import type { ClockAdapter } from "./contracts"

export function createSystemClock(): ClockAdapter {
  return {
    now() {
      return new Date()
    },
  }
}
