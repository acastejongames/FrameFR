import { useCallback, useEffect, useState } from 'react'
import { readStored, writeStored } from '@/lib/storage'

/**
 * `useState` that survives a reload.
 *
 * The value is written back to `localStorage` on every change, and read once
 * on mount. A validator can reject a stored value that no longer matches the
 * current shape (for instance after a settings change), in which case the
 * fallback is used instead.
 */
export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
  validate?: (value: unknown) => value is T,
): [T, (value: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = readStored<unknown>(key, null)
    if (stored === null) return typeof initial === 'function' ? (initial as () => T)() : initial
    if (validate && !validate(stored)) {
      return typeof initial === 'function' ? (initial as () => T)() : initial
    }
    return stored as T
  })

  useEffect(() => {
    writeStored(key, value)
  }, [key, value])

  const update = useCallback((next: T | ((current: T) => T)) => {
    setValue((current) => (typeof next === 'function' ? (next as (c: T) => T)(current) : next))
  }, [])

  return [value, update]
}
