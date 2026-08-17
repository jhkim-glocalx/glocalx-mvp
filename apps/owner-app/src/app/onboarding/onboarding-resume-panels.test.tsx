import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  AdoptionReviewingPanel,
  GbpConnectedResumePanel,
} from "./onboarding-resume-panels"

describe("onboarding resume panels", () => {
  it("gives a waiting owner nothing to do and permission to leave", () => {
    // When
    const html = renderToStaticMarkup(<AdoptionReviewingPanel />)

    // Then an owner waiting on an operator has no action available, so offering
    // one would only invite a pointless retry. Telling them the screen is safe to
    // close is the point: without a resume they would have been trapped here.
    expect(html).toContain("담당자가 확인하고 있어요")
    expect(html).toContain("닫으셔도 괜찮아요")
    expect(html).not.toContain("<button")
  })

  it("resumes a connected owner at the Instagram step, not at the exit", () => {
    // When
    const html = renderToStaticMarkup(<GbpConnectedResumePanel />)

    // Then reloading is not a way around the last onboarding question.
    expect(html).toContain("Google 비즈니스 프로필이 연결됐어요")
    expect(html).toContain("인스타그램 계정도 운영하고 계신가요?")
    expect(html).not.toContain("매장 홍보 처음 시키러 가기")
  })
})
