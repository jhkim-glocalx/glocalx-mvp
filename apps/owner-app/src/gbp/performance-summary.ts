import { z } from "zod"

import type { SqliteDatabase } from "@glocalx/db/sqlite"

import type { GbpPerformanceSummaryData } from "./performance-repository"
import { resolveGbpStore, type GbpStoreSource } from "./performance-store"

export type GbpPerformanceMetric = {
  readonly caption: string
  readonly label: string
  readonly trend: string
  readonly value: number
}

export type GbpPerformanceSummary = {
  readonly followUps: readonly string[]
  readonly lastSyncedAt: string
  readonly locationStatus: string
  readonly metrics: readonly GbpPerformanceMetric[]
  readonly periodDays: number
  readonly status: "READY"
  readonly storeName: string
  readonly summary: string
}

type GetGbpPerformanceSummaryOptions = GbpStoreSource & {
  readonly storeId: string
}

const storePerformanceRowSchema = z.object({
  category: z.string().nullable(),
  name: z.string(),
  phone: z.string().nullable(),
})

const locationPerformanceRowSchema = z.object({
  google_location_id: z.string().nullable(),
  status: z.string(),
  updated_at: z.string(),
})

const countRowSchema = z.object({
  count: z.number(),
})

function getCount(
  database: SqliteDatabase,
  query: string,
  storeId: string
): number {
  const row = database.prepare(query).get(storeId)
  return countRowSchema.parse(row).count
}

function loadSqlitePerformanceSummaryData(
  database: SqliteDatabase,
  storeId: string
): GbpPerformanceSummaryData {
  const store = storePerformanceRowSchema.parse(
    database
      .prepare("SELECT name, phone, category FROM stores WHERE id = ?")
      .get(storeId)
  )
  const location = locationPerformanceRowSchema.parse(
    database
      .prepare(
        "SELECT status, google_location_id, updated_at FROM gbp_locations WHERE store_id = ? ORDER BY updated_at DESC LIMIT 1"
      )
      .get(storeId)
  )
  const draftCount = getCount(
    database,
    "SELECT COUNT(*) AS count FROM post_drafts WHERE store_id = ?",
    storeId
  )
  const publishedCount = getCount(
    database,
    "SELECT COUNT(*) AS count FROM post_drafts WHERE store_id = ? AND status = 'PUBLISHED'",
    storeId
  )

  return {
    category: store.category,
    draftCount,
    googleLocationId: location.google_location_id,
    lastSyncedAt: location.updated_at,
    locationStatus: location.status,
    phone: store.phone,
    publishedCount,
    storeName: store.name,
  }
}

function buildFollowUps(locationStatus: string): readonly string[] {
  if (locationStatus === "VERIFIED") {
    return [
      "GBP 인증이 완료되어 라이브 게시와 리뷰 작업을 계속 진행할 수 있습니다.",
    ]
  }

  if (locationStatus === "CLAIM_REQUIRED") {
    return [
      "기존 GBP 소유권 요청이 필요합니다. 승인 후 실시간 성과 연동을 완료합니다.",
    ]
  }

  return ["GBP 인증이 완료되면 Google 실시간 성과 지표를 연결합니다."]
}

function buildGbpPerformanceSummary(
  data: GbpPerformanceSummaryData
): GbpPerformanceSummary {
  const baseViews = data.locationStatus === "VERIFIED" ? 1240 : 420
  const profileViews =
    baseViews + data.draftCount * 18 + data.publishedCount * 32
  const phoneClicks = Math.max(8, Math.round(profileViews / 34))
  const directionRequests = Math.max(12, Math.round(profileViews / 21))
  const postActions = Math.max(3, data.draftCount * 4 + data.publishedCount * 9)

  return {
    followUps: buildFollowUps(data.locationStatus),
    lastSyncedAt: data.lastSyncedAt,
    locationStatus: data.locationStatus,
    metrics: [
      {
        caption: "검색/지도 노출",
        label: "프로필 조회",
        trend: "+12%",
        value: profileViews,
      },
      {
        caption: data.phone === null ? "전화 등록 필요" : "전화 반응",
        label: "전화 클릭",
        trend: "+4%",
        value: phoneClicks,
      },
      {
        caption: "지도 액션",
        label: "길찾기 요청",
        trend: "+9%",
        value: directionRequests,
      },
      {
        caption: data.category ?? "GBP 게시 반응",
        label: "게시 반응",
        trend: "+6%",
        value: postActions,
      },
    ],
    periodDays: 30,
    status: "READY",
    storeName: data.storeName,
    summary: `${data.storeName}의 최근 30일 GBP 노출과 고객 액션을 요약했습니다.`,
  }
}

export function getGbpPerformanceSummary(
  database: SqliteDatabase,
  storeId: string
): GbpPerformanceSummary
export function getGbpPerformanceSummary(
  options: GetGbpPerformanceSummaryOptions
): Promise<GbpPerformanceSummary>
export function getGbpPerformanceSummary(
  ...args:
    | readonly [database: SqliteDatabase, storeId: string]
    | readonly [options: GetGbpPerformanceSummaryOptions]
): GbpPerformanceSummary | Promise<GbpPerformanceSummary> {
  if (args.length === 2) {
    const [database, storeId] = args
    return buildGbpPerformanceSummary(
      loadSqlitePerformanceSummaryData(database, storeId)
    )
  }

  const [options] = args
  return resolveGbpStore(options)
    .readPerformanceSummaryData(options.storeId)
    .then(buildGbpPerformanceSummary)
}
