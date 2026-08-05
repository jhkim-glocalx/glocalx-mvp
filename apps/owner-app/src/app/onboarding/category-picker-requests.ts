import { z } from "zod"

// The client only ever handles categories the server hands back, so it never
// imports the (large, server-only) category catalog snapshot.
export type GbpCategoryOption = {
  readonly categoryId: string
  readonly displayName: string
}

const categoryOptionSchema = z.object({
  categoryId: z.string(),
  displayName: z.string(),
})

const initialStateSchema = z.object({
  selected: categoryOptionSchema.optional(),
  suggestions: z.array(categoryOptionSchema).default([]),
})

const searchResultSchema = z.object({
  matches: z.array(categoryOptionSchema).default([]),
})

const saveResultSchema = z.object({
  status: z.string(),
  selected: categoryOptionSchema.optional(),
})

export type CategoryInitialState = {
  readonly selected?: GbpCategoryOption
  readonly suggestions: readonly GbpCategoryOption[]
}

export type CategorySaveResult =
  | { readonly kind: "saved"; readonly selected: GbpCategoryOption }
  | { readonly kind: "error" }

export async function requestCategoryInitialState(): Promise<CategoryInitialState> {
  const response = await fetch("/api/gbp/category", { method: "GET" })
  const parsed = initialStateSchema.safeParse(await readJson(response))
  if (!parsed.success) {
    return { suggestions: [] }
  }
  return {
    ...(parsed.data.selected === undefined
      ? {}
      : { selected: parsed.data.selected }),
    suggestions: parsed.data.suggestions,
  }
}

export async function requestCategorySearch(
  query: string
): Promise<readonly GbpCategoryOption[]> {
  const params = new URLSearchParams({ q: query })
  const response = await fetch(`/api/gbp/category?${params.toString()}`, {
    method: "GET",
  })
  const parsed = searchResultSchema.safeParse(await readJson(response))
  return parsed.success ? parsed.data.matches : []
}

export async function saveCategorySelection(
  categoryId: string
): Promise<CategorySaveResult> {
  const response = await fetch("/api/gbp/category", {
    body: JSON.stringify({ categoryId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const parsed = saveResultSchema.safeParse(await readJson(response))
  if (
    !response.ok ||
    !parsed.success ||
    parsed.data.status !== "SAVED" ||
    parsed.data.selected === undefined
  ) {
    return { kind: "error" }
  }
  return { kind: "saved", selected: parsed.data.selected }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}
