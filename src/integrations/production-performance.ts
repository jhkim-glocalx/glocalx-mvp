import { blockedByCredentials, googleBusinessManageScope } from "./credentials"
import type {
  AdapterEnvironment,
  AdapterResult,
  FetchGbpPerformanceInput,
  GbpPerformanceAdapter,
  HttpRequestSpec,
} from "./contracts"

const googleEnvVars = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const

function missingGoogleEnvVars(env: AdapterEnvironment): readonly string[] {
  return googleEnvVars.filter((name) => {
    const value = env[name]
    return value === undefined || value.trim() === ""
  })
}

function googleHeaders(accessToken: string): Readonly<Record<string, string>> {
  return {
    Authorization: `Bearer ${accessToken}`,
  }
}

export function createProductionPerformance(
  env: AdapterEnvironment
): GbpPerformanceAdapter {
  return {
    fetchMultiDailyMetricsTimeSeries(
      input: FetchGbpPerformanceInput
    ): AdapterResult<HttpRequestSpec> {
      const missing = missingGoogleEnvVars(env)
      if (missing.length > 0) {
        return blockedByCredentials(missing)
      }

      const url = new URL(
        `https://businessprofileperformance.googleapis.com/v1/${input.location}:fetchMultiDailyMetricsTimeSeries`
      )
      for (const metric of input.dailyMetrics) {
        url.searchParams.append("dailyMetrics", metric)
      }
      url.searchParams.set(
        "dailyRange.start_date.year",
        String(input.dailyRange.startDate.year)
      )
      url.searchParams.set(
        "dailyRange.start_date.month",
        String(input.dailyRange.startDate.month)
      )
      url.searchParams.set(
        "dailyRange.start_date.day",
        String(input.dailyRange.startDate.day)
      )
      url.searchParams.set(
        "dailyRange.end_date.year",
        String(input.dailyRange.endDate.year)
      )
      url.searchParams.set(
        "dailyRange.end_date.month",
        String(input.dailyRange.endDate.month)
      )
      url.searchParams.set(
        "dailyRange.end_date.day",
        String(input.dailyRange.endDate.day)
      )

      return {
        kind: "ok",
        value: {
          headers: googleHeaders(input.accessToken),
          method: "GET",
          requiredScopes: [googleBusinessManageScope],
          url: url.toString(),
        },
      }
    },
  }
}
