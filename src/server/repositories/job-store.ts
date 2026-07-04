export type JobRunType = "GBP_FOLLOW_UP" | "POST_PUBLISH_RETRY" | "REVIEW_SYNC"
export type JobRunStatus = "SCHEDULED" | "RUNNING" | "SUCCEEDED" | "FAILED"

export type JobRunRecord = {
  readonly id: string
  readonly attempts: number
  readonly createdAt: string
  readonly idempotencyKey: string
  readonly runAfter: string
  readonly status: JobRunStatus
  readonly storeId: string
  readonly type: JobRunType
  readonly updatedAt: string
}

export interface JobStore {
  upsertJobRun(record: JobRunRecord): void
  readJobRun(id: string): JobRunRecord | undefined
  readJobRunByIdempotencyKey(idempotencyKey: string): JobRunRecord | undefined
  updateJobRunStatus(options: {
    readonly attempts: number
    readonly id: string
    readonly status: JobRunStatus
    readonly updatedAt: string
  }): JobRunRecord | undefined
}
