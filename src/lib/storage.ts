/**
 * Thin wrapper around `localStorage`.
 *
 * Everything the user configures (airport shortcuts, provider, poll interval,
 * GUI visibility…) is stored in the browser so the app remembers it between
 * sessions. The helpers never throw: private browsing modes and disabled
 * storage must not break the app.
 */

const PREFIX = 'aeroscope:'

/** Reads and parses a value, returning `fallback` when anything goes wrong. */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Serialises and stores a value. Silently ignores quota errors. */
export function writeStored(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage is unavailable or full: the app keeps working in memory.
  }
}

/** Removes a stored value. */
export function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key)
  } catch {
    // Ignored.
  }
}
