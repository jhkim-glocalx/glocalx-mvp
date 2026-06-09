import { expect, test, type APIRequestContext } from "@playwright/test"

import { resetE2eDatabase } from "./global-setup"

async function createDemoSession(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/auth/demo-login", {
    maxRedirects: 0,
  })

  expect(response.status()).toBe(303)
}

test.beforeEach(async ({ request }) => {
  resetE2eDatabase()
  await createDemoSession(request)
})

test("Stub Naver link extraction returns a normalized business candidate", async ({
  request,
}) => {
  const response = await request.post("/api/onboarding/extractions", {
    data: { input: "https://naver.me/mybrunchcafe" },
  })

  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body).toMatchObject({
    status: "CANDIDATES_FOUND",
    candidates: [
      {
        name: "브런치모먼트 홍대점",
        missingFields: ["hours"],
      },
    ],
  })
})

test("No Naver result fallback offers manual entry in Korean", async ({
  request,
}) => {
  const response = await request.post("/api/onboarding/extractions", {
    data: { input: "없는가게zzzz" },
  })

  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body).toMatchObject({
    status: "MANUAL_INPUT_REQUIRED",
    message:
      "네이버에서 매장을 찾지 못했습니다. 직접 입력으로 계속할 수 있습니다.",
    manualForm: {
      requiredFields: ["name", "address", "category"],
    },
  })
})

test("Opaque Naver place links ask for a store name", async ({ request }) => {
  const response = await request.post("/api/onboarding/extractions", {
    data: { input: "https://map.naver.com/p/entry/place/123456789" },
  })

  expect(response.status()).toBe(200)
  const body = await response.json()
  expect(body).toMatchObject({
    status: "SEARCH_QUERY_REQUIRED",
    retrievalError: {
      code: "OPAQUE_NAVER_PLACE_LINK",
      message:
        "네이버 링크에서 가게 이름을 읽지 못했습니다. 가게 이름을 입력해주세요.",
    },
  })
})
