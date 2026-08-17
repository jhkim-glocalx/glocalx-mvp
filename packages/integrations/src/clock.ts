import type { ClockAdapter } from "./contracts"

// The real clock, used whenever no explicit `now` is injected. Reading the
// system time per call (rather than capturing one Date at adapter
// construction) keeps timestamps honest inside a single request: a publish
// that waits on a slow upstream stamps its completion at completion time, not
// at request start. Tests pin time by passing `options.now`, which selects the
// frozen `createStubClock` instead.
export function createSystemClock(): ClockAdapter {
  return {
    now() {
      return new Date()
    },
  }
}
