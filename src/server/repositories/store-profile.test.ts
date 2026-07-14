import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import type { ConfirmedStoreProfile } from "@/domain/schemas"
import { openDatabaseContext } from "@/server/db"
import type { Queryable } from "@/server/db"
import { hasConfiguredPostgresDirectUrl } from "@/server/db/postgres/direct-url.ts"

import { createDatabaseStoreProfileRepository } from "./store-profile"

const tempDirectories: string[] = []

const countSchema = z
  .union([z.number(), z.string(), z.bigint()])
  .transform((value) => Number(value))

const confirmedRowsSchema = z.object({
  extractionCount: countSchema,
  extractionSourceInput: z.string(),
  storeHours: z.string(),
  storeName: z.string(),
  storeOnboardingStatus: z.string(),
})

function createTempDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "glocalx-store-profile-repo-"))
  tempDirectories.push(directory)
  return join(directory, "test.db")
}

async function createStoreProfileFixture(queryable: Queryable): Promise<void> {
  await queryable.execute(
    "CREATE TEMP TABLE stores (id text PRIMARY KEY, name text NOT NULL, address text NOT NULL, phone text, category text NOT NULL, hours text, onboarding_status text NOT NULL)"
  )
  await queryable.execute(
    "CREATE TEMP TABLE business_profile_extractions (id text PRIMARY KEY, store_id text NOT NULL, source text NOT NULL, source_input text NOT NULL, status text NOT NULL, candidate_json text NOT NULL, missing_fields_json text NOT NULL, created_at text NOT NULL)"
  )
  await queryable.execute(
    "INSERT INTO stores (id, name, address, phone, category, hours, onboarding_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      "demo-store",
      "브런치모먼트",
      "서울 마포구 와우산로 123",
      null,
      "카페",
      null,
      "NOT_STARTED",
    ]
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe("database store profile repository", () => {
  it("confirms the owner profile through the queryable boundary", async () => {
    // Given: a SQLite queryable with the store profile tables.
    vi.stubEnv("DATABASE_PROVIDER", "sqlite")
    vi.stubEnv("GLOCALX_DB_PATH", createTempDatabasePath())
    const context = await openDatabaseContext()

    try {
      await context.queryable.transaction(async (transaction) => {
        await createStoreProfileFixture(transaction)
        const repository = createDatabaseStoreProfileRepository(transaction)
        const firstProfile = {
          address: "서울 마포구 양화로 19",
          category: "라멘",
          hours: "11:00 ~ 22:00",
          name: "라멘하우스 합정점",
          naverPlaceUrl: "https://naver.me/ramenhouse",
          phone: "02-987-6543",
          source: "NAVER_LOCAL",
          sourceInput: "https://naver.me/ramenhouse",
        } satisfies ConfirmedStoreProfile
        const secondProfile = {
          address: "서울 마포구 양화로 19",
          category: "라멘",
          hours: "10:30 ~ 21:30",
          name: "라멘하우스 합정 리뉴얼",
          phone: "02-987-6543",
          source: "MANUAL",
          sourceInput: "owner-confirmed",
        } satisfies ConfirmedStoreProfile

        // When: the same confirmed snapshot is written twice.
        const firstResult = await repository.confirmProfile({
          now: new Date("2026-06-04T00:00:00.000Z"),
          profile: firstProfile,
          storeId: "demo-store",
        })
        const secondResult = await repository.confirmProfile({
          now: new Date("2026-06-04T00:01:00.000Z"),
          profile: secondProfile,
          storeId: "demo-store",
        })
        const row = confirmedRowsSchema.parse(
          await transaction.queryOne(
            'SELECT stores.name AS "storeName", stores.hours AS "storeHours", stores.onboarding_status AS "storeOnboardingStatus", business_profile_extractions.source_input AS "extractionSourceInput", (SELECT COUNT(*) FROM business_profile_extractions WHERE id = ?) AS "extractionCount" FROM stores JOIN business_profile_extractions ON business_profile_extractions.store_id = stores.id WHERE stores.id = ? AND business_profile_extractions.id = ?',
            [
              "confirmed-extraction-demo-store",
              "demo-store",
              "confirmed-extraction-demo-store",
            ]
          )
        )

        // Then: the repository preserves the existing public result and idempotent row shape.
        expect(firstResult).toEqual({
          extractionId: "confirmed-extraction-demo-store",
          message: "매장 정보 확인 완료. GBP 설정을 이어갈게요.",
          status: "CONFIRMED",
        })
        expect(secondResult).toMatchObject({
          extractionId: "confirmed-extraction-demo-store",
          status: "CONFIRMED",
        })
        expect(row).toEqual({
          extractionCount: 1,
          extractionSourceInput: "owner-confirmed",
          storeHours: "10:30 ~ 21:30",
          storeName: "라멘하우스 합정 리뉴얼",
          storeOnboardingStatus: "IN_PROGRESS",
        })
      })
    } finally {
      await context.close()
    }
  })

  it("runs Postgres profile confirmation when local Postgres env is configured", async () => {
    // Given: live Postgres integration is intentionally gated by both URLs.
    const missingEnvNames = [
      ...(!process.env["DATABASE_URL"] ? ["DATABASE_URL"] : []),
      ...(hasConfiguredPostgresDirectUrl(process.env)
        ? []
        : [
            "DATABASE_URL_DIRECT or DATABASE_URL_UNPOOLED or POSTGRES_URL_NON_POOLING",
          ]),
    ]
    if (missingEnvNames.length > 0) {
      console.info(`BLOCKED_BY_ENV missing ${missingEnvNames.join(",")}`)
      return
    }

    vi.stubEnv("DATABASE_PROVIDER", "postgres")
    const context = await openDatabaseContext()

    try {
      await context.queryable.transaction(async (transaction) => {
        await createStoreProfileFixture(transaction)
        const repository = createDatabaseStoreProfileRepository(transaction)

        // When: the same repository boundary runs on the Postgres queryable.
        const result = await repository.confirmProfile({
          now: new Date("2026-06-04T00:00:00.000Z"),
          profile: {
            address: "서울 마포구 양화로 19",
            category: "라멘",
            hours: "11:00 ~ 22:00",
            name: "라멘하우스 합정점",
            naverPlaceUrl: "https://naver.me/ramenhouse",
            phone: "02-987-6543",
            source: "NAVER_LOCAL",
            sourceInput: "https://naver.me/ramenhouse",
          },
          storeId: "demo-store",
        })
        const row = confirmedRowsSchema.parse(
          await transaction.queryOne(
            'SELECT stores.name AS "storeName", stores.hours AS "storeHours", stores.onboarding_status AS "storeOnboardingStatus", business_profile_extractions.source_input AS "extractionSourceInput", (SELECT COUNT(*) FROM business_profile_extractions WHERE id = ?) AS "extractionCount" FROM stores JOIN business_profile_extractions ON business_profile_extractions.store_id = stores.id WHERE stores.id = ? AND business_profile_extractions.id = ?',
            [
              "confirmed-extraction-demo-store",
              "demo-store",
              "confirmed-extraction-demo-store",
            ]
          )
        )

        // Then: Postgres observes the same public result and persisted row.
        expect(result).toEqual({
          extractionId: "confirmed-extraction-demo-store",
          message: "매장 정보 확인 완료. GBP 설정을 이어갈게요.",
          status: "CONFIRMED",
        })
        expect(row).toEqual({
          extractionCount: 1,
          extractionSourceInput: "https://naver.me/ramenhouse",
          storeHours: "11:00 ~ 22:00",
          storeName: "라멘하우스 합정점",
          storeOnboardingStatus: "IN_PROGRESS",
        })
      })
    } finally {
      await context.close()
    }
  })
})
