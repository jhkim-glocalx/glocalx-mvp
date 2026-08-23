import { randomUUID } from "node:crypto"

import type { NextRequest } from "next/server"

import { resolveAdoptionCandidate } from "@/gbp/adoption"
import {
  readDatabaseSession,
  requiredSessionResponse,
  withQueryableRouteDatabase,
} from "@/server/http"

// The owner's "이미 등록했어요" claim for a listing our org account already
// manages (the stores set up by hand before the app existed).
//
// The response deliberately carries no listing details. A match is resolved
// server-side and handed to an operator; telling the owner *which* org listing
// matched — or that any did — would leak another customer's business to anyone
// who can guess a name and address. The owner learns only that we are checking.
export async function POST(request: NextRequest) {
  return withQueryableRouteDatabase(
    async ({
      adapters,
      gbpAccessStore,
      sessionStore,
      storeProfileRepository,
    }) => {
      const session = await readDatabaseSession(request, sessionStore)
      if (session === undefined) {
        return requiredSessionResponse()
      }

      const profileResult =
        await storeProfileRepository.readConfirmedGbpProfile(session.storeId)
      if (profileResult.kind === "missing") {
        return Response.json({
          status: "STORE_PROFILE_REQUIRED",
          message: "먼저 매장 정보를 확인해주세요.",
        })
      }

      const resolved = await resolveAdoptionCandidate({
        adapters,
        env: process.env,
        fetchImpl: fetch,
        profile: {
          name: profileResult.profile.name,
          address: profileResult.profile.address,
          phone: profileResult.profile.phone,
        },
      })

      if (resolved.kind === "blocked_by_credentials") {
        return Response.json({
          status: "BLOCKED_BY_CREDENTIALS",
          missingEnvVars: resolved.missingEnvVars,
          message: "Google Business Profile 인증 정보가 설정되지 않았습니다.",
        })
      }
      if (resolved.kind === "upstream_error") {
        return Response.json({
          status: "UPSTREAM_ERROR",
          message: resolved.message,
        })
      }
      // A miss opens the review anyway, with no candidate attached. The matcher
      // compares names and addresses; the operator hand-built these listings and
      // knows which one belongs to whom. Returning a dead end here would hide the
      // owner from the console precisely when the operator's knowledge is the
      // only thing that can connect them.
      const review = await gbpAccessStore.openAdoptionReview({
        id: randomUUID(),
        storeId: session.storeId,
        gbpLocationRef:
          resolved.kind === "matched" ? resolved.match.location.name : null,
        now: adapters.clock.now(),
      })

      if (review.kind === "already_tracked") {
        return Response.json({
          status: "ALREADY_TRACKED",
          state: review.request.state,
          message: "이미 확인 중이거나 연결된 매장입니다.",
        })
      }

      // Same answer whether or not the matcher hit: the owner is waiting on the
      // same person either way, and telling them "찾지 못했어요" would read as a
      // rejection of a claim nobody has ruled on yet.
      return Response.json({
        status: "REVIEW_OPENED",
        message:
          "등록된 프로필을 확인하고 있어요. 담당자 확인 후 연결해드릴게요.",
      })
    }
  )
}
