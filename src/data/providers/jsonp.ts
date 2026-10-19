/**
 * Minimal JSONP transport.
 *
 * Some ADS-B aggregators (notably the Flightradar24 zone feed) do not send the
 * `Access-Control-Allow-Origin` header, so they cannot be read with `fetch`
 * from a browser. Their API does support the classic JSONP callback though, so
 * we inject a `<script>` tag with a generated callback name.
 *
 * The transport is deliberately defensive: the callback is always removed and
 * the timer always cleared, so a slow or hostile endpoint cannot leak
 * handlers into the page.
 */

/** Unique-ish callback name; the random suffix avoids clashes with other code. */
function callbackName(): string {
  return `__aeroscope_cb_${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Performs a JSONP request.
 *
 * @param urlTemplate URL containing the literal `__CALLBACK__` placeholder.
 * @param timeoutMs  Milliseconds before the request is considered failed.
 */
export function jsonp<T>(urlTemplate: string, timeoutMs = 8000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const name = callbackName()
    const script = document.createElement('script')
    let settled = false

    const cleanup = (): void => {
      try {
        delete (window as unknown as Record<string, unknown>)[name]
      } catch {
        ;(window as unknown as Record<string, unknown>)[name] = undefined
      }
      if (script.parentNode) script.parentNode.removeChild(script)
    }

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('JSONP: tiempo de espera agotado'))
    }, timeoutMs)

    ;(window as unknown as Record<string, unknown>)[name] = (payload: T) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanup()
      resolve(payload)
    }

    script.onerror = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanup()
      reject(new Error('JSONP: error de red'))
    }

    script.referrerPolicy = 'no-referrer'
    script.src = urlTemplate.replace('__CALLBACK__', name)
    document.head.appendChild(script)
  })
}
