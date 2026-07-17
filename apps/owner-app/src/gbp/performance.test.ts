import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { createIntegrationAdapters } from "@glocalx/integrations"
import {
  applyMigrations,
  openDatabase,
  seedDemoData,
  type SqliteDatabase,
} from "@glocalx/db/sqlite"

import {
  getGbpPerformanceDashboard,
  getGbpPerformanceSummary,
} from "./performance"

type TestDatabaseHandle = {
  readonly database: SqliteDatabase
  readonly tempPath: string
}

describe("GBP performance service", () => {
  const tempPaths: string[] = []

  afterEach(async () => {
    for (const tempPath of tempPaths) {
      await rm(tempPath, { force: true, recursive: true })
    }
    tempPaths.length = 0
  })

  async function openSeededTestDatabase(): Promise<TestDatabaseHandle> {
    const tempPath = await mkdtemp(join(tmpdir(), "glocalx-gbp-performance-"))
    tempPaths.push(tempPath)
    const database = openDatabase(join(tempPath, "performance.db"))
    applyMigrations(database)
    seedDemoData(database)
    return { database, tempPath }
  }

  function readyMetric(
    result: Awaited<ReturnType<typeof getGbpPerformanceDashboard>>,
    key: string
  ) {
    if (result.status !== "READY") {
      throw new Error("expected ready performance result")
    }
    const metric = result.metrics.find((item) => item.key === key)
    if (metric === undefined) {
      throw new Error(`missing metric ${key}`)
    }
    return metric
  }

  it("builds owner-scoped GBP performance metrics from stored onboarding data", async () => {
    const { database } = await openSeededTestDatabase()

    try {
      const summary = getGbpPerformanceSummary(database, "demo-store")

      expect(summary.status).toBe("READY")
      expect(summary.storeName).toBe("브런치모먼트 홍대점")
      expect(summary.locationStatus).toBe("VERIFIED")
      expect(summary.metrics.map((metric) => metric.label)).toEqual([
        "프로필 조회",
        "전화 클릭",
        "길찾기 요청",
        "게시 반응",
      ])
      expect(summary.followUps).toContain(
        "GBP 인증이 완료되어 라이브 게시와 리뷰 작업을 계속 진행할 수 있습니다."
      )
    } finally {
      database.close()
    }
  })

  it("surfaces verification follow-up when setup is still pending", async () => {
    const { database } = await openSeededTestDatabase()

    try {
      database
        .prepare("UPDATE gbp_locations SET status = ? WHERE store_id = ?")
        .run("VERIFICATION_PENDING", "demo-store")

      const summary = getGbpPerformanceSummary(database, "demo-store")

      expect(summary.locationStatus).toBe("VERIFICATION_PENDING")
      expect(summary.followUps).toContain(
        "GBP 인증이 완료되면 Google 실시간 성과 지표를 연결합니다."
      )
    } finally {
      database.close()
    }
  })

  it("aggregates deterministic stub metrics for the last 30 complete Korea days", async () => {
    const { database } = await openSeededTestDatabase()
    const adapters = createIntegrationAdapters({
      database,
      env: {},
      now: new Date("2026-06-09T03:00:00.000Z"),
    })

    try {
      const result = await getGbpPerformanceDashboard({
        adapters,
        database,
        now: new Date("2026-06-09T03:00:00.000Z"),
        storeId: "demo-store",
      })

      expect(result.status).toBe("READY")
      if (result.status !== "READY") {
        throw new Error("expected ready performance result")
      }
      expect(result.range).toEqual({
        endDate: "2026-06-08",
        previousEndDate: "2026-05-09",
        previousStartDate: "2026-04-10",
        startDate: "2026-05-10",
      })
      expect(readyMetric(result, "impressions")).toMatchObject({
        changePercent: 14.3,
        previousTotal: 1050,
        total: 1200,
      })
      expect(readyMetric(result, "directions")).toMatchObject({
        changePercent: 50,
        previousTotal: 60,
        total: 90,
      })
      expect(readyMetric(result, "calls")).toMatchObject({
        changePercent: 0,
        previousTotal: 30,
        total: 30,
      })
      expect(readyMetric(result, "website")).toMatchObject({
        changePercent: 33.3,
        previousTotal: 90,
        total: 120,
      })
    } finally {
      database.close()
    }
  })

  it("blocks when the owner Google connection does not include business.manage", async () => {
    const { database } = await openSeededTestDatabase()
    const adapters = createIntegrationAdapters({ database, env: {} })

    try {
      database
        .prepare("UPDATE oauth_connections SET scopes_json = ? WHERE id = ?")
        .run(JSON.stringify(["openid", "email"]), "demo-oauth-google")

      const result = await getGbpPerformanceDashboard({
        adapters,
        database,
        now: new Date("2026-06-09T03:00:00.000Z"),
        storeId: "demo-store",
      })

      expect(result).toEqual({
        code: "MISSING_BUSINESS_MANAGE_SCOPE",
        message:
          "Google Business Profile 성과를 보려면 business.manage 권한이 필요합니다.",
        status: "BLOCKED",
      })
    } finally {
      database.close()
    }
  })

  it("maps malformed Google performance payloads to a controlled error", async () => {
    const { database } = await openSeededTestDatabase()
    const adapters = createIntegrationAdapters({
      database,
      env: {
        APP_INTEGRATION_MODE: "production",
        GOOGLE_CLIENT_ID: "test-google-client",
        GOOGLE_CLIENT_SECRET: "test-google-secret",
      },
    })

    try {
      const result = await getGbpPerformanceDashboard({
        adapters,
        database,
        fetchImpl: async () =>
          Response.json({
            multiDailyMetricTimeSeries: [
              {
                dailyMetricTimeSeries: [
                  {
                    dailyMetric: "WEBSITE_CLICKS",
                    timeSeries: {
                      datedValues: [
                        {
                          date: { day: 8, month: 6, year: 2026 },
                          value: "not-an-integer",
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          }),
        now: new Date("2026-06-09T03:00:00.000Z"),
        storeId: "demo-store",
      })

      expect(result).toEqual({
        code: "GOOGLE_RESPONSE_MALFORMED",
        message: "Google Business Profile 성과 응답을 읽지 못했습니다.",
        status: "ERROR",
      })
    } finally {
      database.close()
    }
  })
})
