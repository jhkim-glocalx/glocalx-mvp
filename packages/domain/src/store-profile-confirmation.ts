export type ConfirmStoreProfileResult = {
  readonly status: "CONFIRMED"
  readonly extractionId: string
  readonly message: string
}

export function confirmedExtractionId(storeId: string): string {
  // One confirmed snapshot per store keeps confirmation idempotent across repeated submit attempts.
  return `confirmed-extraction-${storeId}`
}
