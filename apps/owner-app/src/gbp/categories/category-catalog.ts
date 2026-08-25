import rawCategories from "./gbp-categories-kr.json"

// Google Business Profile's locations.create requires the primary category as a
// `categories/gcid:*` resource name, and the live categories.list search proved
// unusable (filter=displayName returns unrelated results). So the owner instead
// picks from this bundled KR snapshot via local substring search. Regenerate the
// snapshot with scripts/refresh-gbp-categories.mjs.

export type GbpCategory = {
  readonly categoryId: string
  readonly displayName: string
}

const catalog: readonly GbpCategory[] = (
  rawCategories as ReadonlyArray<{
    readonly name: string
    readonly displayName: string
  }>
).map((entry) => ({
  categoryId: entry.name,
  displayName: entry.displayName,
}))

const catalogById = new Map(
  catalog.map((category) => [category.categoryId, category] as const)
)

// Fold away case and every whitespace run so "한식" matches "한식당" and
// "한식 고기구이", and a pasted "Cafe " matches "cafe".
function normalize(value: string): string {
  return value.replace(/\s+/gu, "").toLowerCase()
}

export function gbpCategoryCatalog(): readonly GbpCategory[] {
  return catalog
}

export function findGbpCategoryById(
  categoryId: string
): GbpCategory | undefined {
  return catalogById.get(categoryId)
}

export function isKnownGbpCategoryId(categoryId: string): boolean {
  return catalogById.has(categoryId)
}

function matchRank(normalizedDisplay: string, normalizedQuery: string): number {
  // Lower is better: exact term, then prefix, then anywhere; -1 excludes.
  if (normalizedDisplay === normalizedQuery) {
    return 0
  }
  if (normalizedDisplay.startsWith(normalizedQuery)) {
    return 1
  }
  return normalizedDisplay.includes(normalizedQuery) ? 2 : -1
}

export function rankCategories(
  source: readonly GbpCategory[],
  query: string,
  limit = 20
): readonly GbpCategory[] {
  const normalizedQuery = normalize(query)
  if (normalizedQuery === "") {
    return []
  }

  const scored = source
    .map((category) => ({
      category,
      rank: matchRank(normalize(category.displayName), normalizedQuery),
    }))
    .filter((entry) => entry.rank >= 0)

  scored.sort((left, right) => {
    if (left.rank !== right.rank) {
      return left.rank - right.rank
    }
    // A shorter label is the more general, more likely-intended term
    // ("카페" ahead of "고양이 카페"); fall back to a stable name order.
    if (
      left.category.displayName.length !== right.category.displayName.length
    ) {
      return (
        left.category.displayName.length - right.category.displayName.length
      )
    }
    return left.category.displayName.localeCompare(right.category.displayName)
  })

  return scored.slice(0, limit).map((entry) => entry.category)
}

export function searchGbpCategories(
  query: string,
  limit = 20
): readonly GbpCategory[] {
  return rankCategories(catalog, query, limit)
}

// Naver categories arrive as hierarchical/compound strings like
// "음식점>한식>백반" or "카페,디저트". Split into candidate seed terms ordered
// most-specific-first so the picker can pre-fill the likeliest search.
export function deriveNaverCategorySeeds(
  naverCategory: string
): readonly string[] {
  return naverCategory
    .split(/[>,]/u)
    .map((token) => token.trim())
    .filter((token) => token !== "")
    .reverse()
}

// Naver leaf segments that are homonyms in Korean: substring search against
// the GBP catalog resolves them to an unrelated business type. "양식" is
// "Western-style (food)" in a Naver food-category context, but the only
// catalog entries containing that substring are aquaculture ("양식장" and
// friends) — so an unqualified search must not be trusted for these terms.
const AMBIGUOUS_NAVER_SEED_OVERRIDES: Readonly<Record<string, string>> = {
  양식: "서양음식",
}

// Pre-seed the owner's category picker from the Naver category: try each seed
// term most-specific-first and return the first that yields matches.
export function suggestGbpCategoriesFromNaver(
  naverCategory: string,
  limit = 20
): readonly GbpCategory[] {
  for (const seed of deriveNaverCategorySeeds(naverCategory)) {
    const resolvedSeed = AMBIGUOUS_NAVER_SEED_OVERRIDES[seed] ?? seed
    const matches = searchGbpCategories(resolvedSeed, limit)
    if (matches.length > 0) {
      return matches
    }
  }
  return []
}
