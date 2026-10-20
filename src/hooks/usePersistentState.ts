import { useCallback, useEffect, useRef, useState } from 'react'
import { readStored, writeStored } from '@/lib/storage'

/**
 * In-memory broadcaster so several components can share one stored setting.
 *
 * The 3D viewer edits the quality settings directly from its HUD while the
 * settings dialog edits the same keys. Both hook instances must stay in sync
 * immediately: without this registry one would keep a stale copy and the next
 * change would overwrite the other one.
 */
const listeners = new Map<string, Set<(value: unknown) => void>>()
const PREFIX = 'aeroscope:'

function publish(key: string, value: unknown): void {
  const group = listeners.get(key)
  if (!group) return
  for (const listener of group) listener(value)
}

/**
 * `useState` that survives a reload.
 *
 * The value is written back to `localStorage` on every change, and read once
 * on mount. A validator can reject a stored value that no longer matches the
 * current shape (for instance after a settings change), in which case the
 * fallback is used instead. Instances mounted with the same key (and other
 * browser tabs) stay synchronised.
 */
export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
  validate?: (value: unknown) => value is T,
  normalize?: (value: unknown) => T,
): [T, (value: T | ((current: T) => T)) => void] {
  const fallback = useCallback(
    () => (typeof initial === 'function' ? (initial as () => T)() : initial),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [value, setValue] = useState<T>(() => {
    const stored = readStored<unknown>(key, null)
    if (stored === null) return fallback()
    if (normalize) return normalize(stored)
    if (validate && !validate(stored)) return fallback()
    return stored as T
  })
  const valueRef = useRef(value)
  valueRef.current = value

  // Same-tab instances of the same key.
  useEffect(() => {
    let group = listeners.get(key)
    if (!group) {
      group = new Set()
      listeners.set(key, group)
    }
    const listener = (next: unknown): void => {
      valueRef.current = next as T
      setValue(next as T)
    }
    group.add(listener)
    return () => {
      group.delete(listener)
      if (group.size === 0) listeners.delete(key)
    }
  }, [key])

  // Other browser tabs.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== PREFIX + key || event.newValue === null) return
      try {
        const next = JSON.parse(event.newValue) as T
        valueRef.current = next
        setValue(next)
      } catch {
        // Ignore foreign/corrupted values.
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key])

  const update = useCallback(
    (next: T | ((current: T) => T)) => {
      const resolved =
        typeof next === 'function' ? (next as (current: T) => T)(valueRef.current) : next
      valueRef.current = resolved
      setValue(resolved)
      writeStored(key, resolved)
      publish(key, resolved)
    },
    [key],
  )

  return [value, update]
}
