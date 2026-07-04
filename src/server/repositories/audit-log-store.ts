export type AuditLogRecord = {
  readonly id: string
  readonly action: string
  readonly actorUserId: string | null
  readonly createdAt: string
  readonly idempotencyKey: string | null
  readonly redactedPayload: Readonly<Record<string, unknown>>
  readonly storeId: string | null
}

export interface AuditLogStore {
  appendAuditLog(record: AuditLogRecord): void
  readAuditLog(id: string): AuditLogRecord | undefined
  readAuditLogsForStore(storeId: string): readonly AuditLogRecord[]
}
