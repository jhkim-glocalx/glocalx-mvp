// Onboarding asks the owner to name their Instagram account before it hands
// them to Meta, then compares that answer with the account the authorization
// actually returned. Owners type this field freehand on a phone: some type
// `bar_seomyeon`, some `@bar_seomyeon`, some paste the whole profile URL out of
// the Instagram app's share sheet. Normalizing before comparing is what keeps a
// correct connect from being reported to the owner as a mismatch.

export type InstagramHandleMatch =
  | "match"
  | "mismatch"
  // Not enough information to judge — nothing was asked for, or the
  // authorization returned no username. Callers treat this as "don't warn".
  | "unknown"

/**
 * Reduce a freehand Instagram account name to a bare, comparable handle.
 *
 * Returns "" when the input carries no usable handle; callers read that as
 * "the owner did not really answer" and skip the comparison.
 *
 * Inputs seen in practice:
 *   "bar_seomyeon"                             -> "bar_seomyeon"
 *   "@Bar_Seomyeon"                            -> "bar_seomyeon"
 *   "  @bar.seomyeon  "                        -> "bar.seomyeon"
 *   "https://www.instagram.com/bar_seomyeon/"  -> "bar_seomyeon"
 *   "instagram.com/bar_seomyeon?igsh=abc123"   -> "bar_seomyeon"
 *   "몰라요" / "" / "@"                          -> ""
 *
 * Instagram handles are case-insensitive and limited to letters, digits,
 * periods and underscores.
 */
export function normalizeInstagramHandle(rawHandle: string): string {
  const trimmed = rawHandle.trim().toLowerCase()
  const profileUrl = instagramProfileUrlPattern.exec(trimmed)
  // In a pasted link everything up to the first path segment belongs to
  // Instagram; the segment itself is the handle.
  const candidate =
    profileUrl === null ? trimmed.replace(/^@/, "") : (profileUrl[1] ?? "")

  // Anything left that is not a well-formed handle — a sentence, a post or
  // story link, a bare "@" — is treated as "no answer" rather than guessed at,
  // so a junk value never reaches the owner as "you connected @몰라요".
  if (!handlePattern.test(candidate) || reservedPathSegments.has(candidate)) {
    return ""
  }
  return candidate
}

// Optional scheme and subdomain so a hand-typed "instagram.com/..." reads the
// same as the app's own "https://www.instagram.com/...". The leading anchor
// plus the required dot keeps look-alike hosts from matching.
const instagramProfileUrlPattern =
  /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*instagram\.com\/([^/?#]+)/

const handlePattern = /^[a-z0-9._]+$/

// First path segments Instagram reserves for content rather than profiles — a
// pasted post or reel link names no account at all.
const reservedPathSegments = new Set([
  "explore",
  "p",
  "reel",
  "reels",
  "stories",
  "tv",
])

// The comparison itself is deliberately thin: every judgement call about what
// counts as "the same account" lives in normalizeInstagramHandle above, so
// there is one place to fix when a new input shape shows up.
export function compareInstagramHandles(
  requestedHandle: string | undefined,
  linkedUsername: string | undefined
): InstagramHandleMatch {
  const requested = normalizeInstagramHandle(requestedHandle ?? "")
  const linked = normalizeInstagramHandle(linkedUsername ?? "")
  if (requested === "" || linked === "") {
    return "unknown"
  }
  return requested === linked ? "match" : "mismatch"
}
