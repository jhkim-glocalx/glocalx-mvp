import {
  interpretGbpVerificationState,
  parseVerificationOptionMethods,
  voiceOfMerchantStateSchema,
  type GbpVerificationState,
  type VoiceOfMerchantState,
} from "@glocalx/domain/gbp-verification-state"
import type {
  AdapterResult,
  ExternalFetch,
  GbpVerificationsAdapter,
  HttpRequestSpec,
} from "@glocalx/integrations/contracts"

// The create-time verification attempt: after the live GBP create, read Google's
// verification signals, opportunistically try AUTO, and re-read to get the state
// worth persisting. Every step is best-effort — the listing already exists, so a
// verification read/verify failure must degrade to UNKNOWN, never abort setup.
// The trusted verdict is VoiceOfMerchantState read *after* the attempt, never the
// verify call's immediate (async-revertible) response.

export type GbpVerificationAttempt = {
  readonly state: GbpVerificationState
  readonly offeredMethods: readonly string[]
  readonly autoAttempted: boolean
}

// A read-only view of the current verification state — no verify(AUTO) write.
// This is what the on-view refresh persists, so it deliberately omits
// autoAttempted (the refresh preserves the create-time flag rather than resetting
// it).
export type GbpVerificationSnapshotResult = {
  readonly state: GbpVerificationState
  readonly offeredMethods: readonly string[]
}

export type RunGbpVerificationAttemptOptions = {
  readonly verifications: GbpVerificationsAdapter
  readonly accessToken: string
  readonly locationName: string
  readonly fetchImpl: ExternalFetch
}

function specFrom(
  result: AdapterResult<HttpRequestSpec>
): HttpRequestSpec | undefined {
  return result.kind === "ok" ? result.value : undefined
}

async function executeSpec(
  spec: HttpRequestSpec,
  fetchImpl: ExternalFetch
): Promise<unknown> {
  try {
    const response = await fetchImpl(spec.url, {
      method: spec.method,
      headers:
        spec.body === undefined
          ? spec.headers
          : { ...spec.headers, "Content-Type": "application/json" },
      ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      return undefined
    }
    return await response.json()
  } catch {
    return undefined
  }
}

async function readOfferedMethods(
  options: RunGbpVerificationAttemptOptions
): Promise<readonly string[]> {
  const spec = specFrom(
    options.verifications.fetchVerificationOptions({
      accessToken: options.accessToken,
      locationName: options.locationName,
    })
  )
  if (spec === undefined) {
    return []
  }
  return parseVerificationOptionMethods(await executeSpec(spec, options.fetchImpl))
}

async function readVoiceOfMerchant(
  options: RunGbpVerificationAttemptOptions
): Promise<VoiceOfMerchantState | undefined> {
  const spec = specFrom(
    options.verifications.getVoiceOfMerchantState({
      accessToken: options.accessToken,
      locationName: options.locationName,
    })
  )
  if (spec === undefined) {
    return undefined
  }
  const parsed = voiceOfMerchantStateSchema.safeParse(
    await executeSpec(spec, options.fetchImpl)
  )
  return parsed.success ? parsed.data : undefined
}

// The on-view refresh: read Google's current verification signals and interpret
// them, without ever calling verify. Best-effort like the attempt — any failed
// read degrades to UNKNOWN rather than throwing, so opening the card can't error.
export async function readGbpVerificationSnapshot(
  options: RunGbpVerificationAttemptOptions
): Promise<GbpVerificationSnapshotResult> {
  const offeredMethods = await readOfferedMethods(options)
  const voiceOfMerchant = await readVoiceOfMerchant(options)
  return {
    state: interpretGbpVerificationState({ voiceOfMerchant, offeredMethods }),
    offeredMethods,
  }
}

export async function runGbpVerificationAttempt(
  options: RunGbpVerificationAttemptOptions
): Promise<GbpVerificationAttempt> {
  const initialMethods = await readOfferedMethods(options)

  // AUTO is the only method worth attempting unattended; the API-drivable methods
  // (postcard/phone/SMS/email) need owner input the concierge flow collects later.
  const autoAttempted = initialMethods.some((method) => method === "AUTO")
  if (autoAttempted) {
    const verifySpec = specFrom(
      options.verifications.verify({
        accessToken: options.accessToken,
        locationName: options.locationName,
        method: "AUTO",
      })
    )
    if (verifySpec !== undefined) {
      await executeSpec(verifySpec, options.fetchImpl)
    }
  }

  const voiceOfMerchant = await readVoiceOfMerchant(options)
  // Re-read the option list only after an AUTO attempt, which changes what Google
  // offers; with no attempt the initial read is still current.
  const offeredMethods = autoAttempted
    ? await readOfferedMethods(options)
    : initialMethods

  return {
    state: interpretGbpVerificationState({ voiceOfMerchant, offeredMethods }),
    offeredMethods,
    autoAttempted,
  }
}
