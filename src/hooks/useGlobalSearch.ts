import { useCallback, useEffect, useRef, useState } from 'react'
import { searchPlanet } from '@/data/globalSearch'
import type { Aircraft } from '@/data/types'

/** Debounce applied before a query is sent to the network. */
const DEBOUNCE_MS = 260

export interface GlobalSearchState {
  /** Aircraft found anywhere on the planet. */
  results: Aircraft[]
  /** `true` while at least one endpoint is still answering. */
  searching: boolean
  /** Debounced entry point used by the search box. */
  schedule: (query: string) => void
  /** Runs a search immediately (used by the Enter key). */
  searchNow: (query: string) => void
  /** Cancels the current search and clears the results. */
  reset: () => void
}

/**
 * Planet-wide aircraft search.
 *
 * The hook keeps a single request alive at a time: typing a new character
 * aborts the previous one, so the dropdown never shows stale results.
 */
export function useGlobalSearch(): GlobalSearchState {
  const [results, setResults] = useState<Aircraft[]>([])
  const [searching, setSearching] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const run = useCallback(
    (query: string) => {
      cancel()
      const trimmed = query.trim()
      if (trimmed.length < 2) {
        setResults([])
        setSearching(false)
        return
      }

      const controller = new AbortController()
      controllerRef.current = controller
      setSearching(true)

      void searchPlanet(
        trimmed,
        (aircraft) => {
          if (controller.signal.aborted) return
          setResults((current) => {
            const merged = new Map(current.map((item) => [item.id, item]))
            for (const item of aircraft) merged.set(item.id, item)
            return Array.from(merged.values())
          })
        },
        controller.signal,
      )
        .catch(() => undefined)
        .finally(() => {
          if (controllerRef.current === controller) {
            controllerRef.current = null
            setSearching(false)
          }
        })
    },
    [cancel],
  )

  /** Debounced entry point used by the search box. */
  const schedule = useCallback(
    (query: string) => {
      cancel()
      if (query.trim().length < 2) {
        setResults([])
        setSearching(false)
        return
      }
      timerRef.current = setTimeout(() => run(query), DEBOUNCE_MS)
    },
    [cancel, run],
  )

  const reset = useCallback(() => {
    cancel()
    setResults([])
    setSearching(false)
  }, [cancel])

  useEffect(() => cancel, [cancel])

  return { results, searching, schedule, searchNow: run, reset }
}
