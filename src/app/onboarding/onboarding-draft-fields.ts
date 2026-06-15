import type { StoreProfileField } from "./onboarding-components"
import type { StoreProfileDraft } from "./onboarding-model"

const missingStoreProfileFields = ["phone", "hours"] as const

export type MissingStoreProfileField =
  (typeof missingStoreProfileFields)[number]

function isMissingStoreProfileField(
  field: StoreProfileField
): field is MissingStoreProfileField {
  return field === "phone" || field === "hours"
}

function sortedMissingFields(values: readonly string[]): readonly string[] {
  return missingStoreProfileFields.filter((field) => values.includes(field))
}

export function firstMissingStoreProfileField(
  draft: StoreProfileDraft
): MissingStoreProfileField | undefined {
  return missingStoreProfileFields.find((field) =>
    draft.missingFields.includes(field)
  )
}

export function updateStoreProfileDraftField(
  draft: StoreProfileDraft,
  field: StoreProfileField,
  value: string
): StoreProfileDraft {
  const nextDraft = {
    ...draft,
    [field]: value,
  }
  if (!isMissingStoreProfileField(field)) {
    return nextDraft
  }

  const remainingFields = draft.missingFields.filter(
    (missingField) => missingField !== field
  )
  const missingFields =
    value.trim() === "" ? [...remainingFields, field] : remainingFields

  return {
    ...nextDraft,
    missingFields: sortedMissingFields(missingFields),
  }
}
