import { z } from "zod"

// The call-to-action button a GBP local post can carry. Proven against live
// Google 2026-08-12: the API echoes callToAction back on create, and normalizes
// the url (sent "https://x.com", returned "https://x.com/"), so never compare a
// stored url to the returned one without normalizing first.
//
// CALL is a separate variant rather than a shared shape with an optional url:
// it renders the listing's own phone number and accepts no link at all, so a
// single `url?` shape would let a caller send a url that is silently dropped.
export const gbpPostLinkActionTypes = [
  "BOOK",
  "ORDER",
  "SHOP",
  "LEARN_MORE",
  "SIGN_UP",
] as const

export type GbpPostLinkActionType = (typeof gbpPostLinkActionTypes)[number]

export type GbpPostCallToAction =
  | { readonly actionType: "CALL" }
  | { readonly actionType: GbpPostLinkActionType; readonly url: string }

// Both branches are strict: without it a url sent alongside CALL is silently
// stripped rather than rejected, and the operator would believe a link they
// entered is live on the post when Google never received it.
export const gbpPostCallToActionSchema = z.union([
  z.object({ actionType: z.literal("CALL") }).strict(),
  z
    .object({
      actionType: z.enum(gbpPostLinkActionTypes),
      url: z.url(),
    })
    .strict(),
])

// Instagram has no button concept, but the same campaign publishes to both
// channels and an owner who agreed to a link expects it to reach followers
// either way. So a GBP button degrades into a caption line there. Labels are
// deliberately here, next to the action types, so the two channels can never
// describe the same button differently — exported so the admin operator
// picker renders the exact same Korean wording the owner's customers see,
// rather than a second translation that can drift from this one.
export const captionLabels: Record<GbpPostLinkActionType, string> = {
  BOOK: "예약",
  ORDER: "주문",
  SHOP: "구매",
  LEARN_MORE: "자세히 보기",
  SIGN_UP: "신청",
}

/**
 * The line appended to a caption on channels that cannot render a button.
 *
 * Returns undefined for CALL: it carries no url at all, so there is nothing to
 * append — writing "전화 주문" with no number would be worse than silence, since
 * the caption cannot dial and the reader is left hunting.
 */
export function callToActionCaptionSuffix(
  callToAction: GbpPostCallToAction
): string | undefined {
  if (callToAction.actionType === "CALL") {
    return undefined
  }
  return `${captionLabels[callToAction.actionType]}: ${callToAction.url}`
}

// The links a store has registered with us. Which of these exist is what a
// future automated policy would choose a button from; today nothing reads them
// except the resolver below.
export type StoreActionLinks = {
  readonly orderUrl?: string
  readonly bookingUrl?: string
  readonly websiteUrl?: string
  readonly hasPhone: boolean
}

/**
 * The default button a post gets when no one has chosen one.
 *
 * CURRENT POLICY: none. Every post's button is set by an operator in the admin
 * queue after talking to the owner (founder decision 2026-08-13), so this
 * returns undefined for every store — that is the policy, not a stub awaiting
 * implementation, and the test pins it as such.
 *
 * It exists as a seam for the automation phase, where a store's registered
 * links would pick a default (ORDER for 배달, BOOK for 예약, CALL as the
 * always-available fallback, or still nothing). When that lands, only this
 * function changes; the operator's explicit choice must keep overriding it.
 */
export function resolveDefaultCallToAction(
  links: StoreActionLinks
): GbpPostCallToAction | undefined {
  void links
  return undefined
}
