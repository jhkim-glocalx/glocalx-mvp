"use client"

import { useEffect, useState } from "react"

import {
  requestCategoryInitialState,
  requestCategorySearch,
  saveCategorySelection,
  type GbpCategoryOption,
} from "./category-picker-requests"

const searchDebounceMs = 250

export function CategoryPicker({
  onSelected,
}: {
  readonly onSelected?: (option: GbpCategoryOption) => void
}) {
  const [selected, setSelected] = useState<GbpCategoryOption | undefined>(
    undefined
  )
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<readonly GbpCategoryOption[]>(
    []
  )
  const [results, setResults] = useState<readonly GbpCategoryOption[]>([])
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    void requestCategoryInitialState().then((state) => {
      if (!active) {
        return
      }
      if (state.selected !== undefined) {
        setSelected(state.selected)
      }
      setSuggestions(state.suggestions)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === "") {
      // Empty query renders `suggestions` (see `options` below), so leaving any
      // stale `results` in place is harmless and avoids a synchronous setState.
      return
    }
    // Debounce so a search fires once the owner pauses typing, not per keystroke.
    let active = true
    const handle = setTimeout(() => {
      void requestCategorySearch(trimmed).then((matches) => {
        if (active) {
          setResults(matches)
        }
      })
    }, searchDebounceMs)
    return () => {
      active = false
      clearTimeout(handle)
    }
  }, [query])

  async function choose(option: GbpCategoryOption) {
    setSaving(true)
    setFailed(false)
    const result = await saveCategorySelection(option.categoryId)
    setSaving(false)
    if (result.kind === "error") {
      setFailed(true)
      return
    }
    setSelected(result.selected)
    setQuery("")
    setResults([])
    onSelected?.(result.selected)
  }

  const options = query.trim() === "" ? suggestions : results

  return (
    <section aria-label="업종(카테고리) 선택" className="grid gap-2">
      <label className="grid gap-2 text-sm font-black text-[var(--ink)]">
        <span>Google 업종 카테고리</span>
        <input
          className="gx-onboarding-input"
          disabled={saving}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="예: 카페, 한식당, 미용실"
          type="search"
          value={query}
        />
      </label>

      {selected === undefined ? (
        <p className="text-xs font-bold text-[var(--muted)]">
          매장 업종을 검색해서 골라주세요. GBP 등록에 사용됩니다.
        </p>
      ) : (
        <p className="text-sm font-bold text-[var(--ink-soft)]">
          선택된 업종:{" "}
          <strong className="text-[var(--mint)]">{selected.displayName}</strong>
        </p>
      )}

      {failed ? (
        <p
          className="text-xs font-bold text-[var(--danger,#c0392b)]"
          role="alert"
        >
          카테고리를 저장하지 못했습니다. 다시 시도해주세요.
        </p>
      ) : null}

      {options.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="업종 후보">
          {options.map((option) => (
            <li key={option.categoryId}>
              <button
                className="rounded-full border border-[var(--line)] bg-white px-3 py-2 text-sm font-bold text-[var(--ink)] shadow-sm disabled:opacity-60"
                disabled={saving}
                onClick={() => void choose(option)}
                type="button"
              >
                {option.displayName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
