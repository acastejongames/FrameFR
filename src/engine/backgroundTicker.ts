/**
 * A tiny heartbeat that keeps working while the document is hidden.
 *
 * `requestAnimationFrame` and, on some browsers, ordinary timers are paused
 * or heavily throttled in hidden tabs. A dedicated worker is scheduled
 * independently, so the fleet controller can continue asking the data feed
 * for real observations while another tab/window is in front. If workers are
 * unavailable, the fallback is a normal one-second interval: functionality
 * stays correct, but the browser may throttle it more aggressively.
 */

export interface BackgroundTicker {
  stop: () => void
}

export function shouldCollectInBackground(hidden: boolean, enabled: boolean): boolean {
  return hidden && enabled
}

export function createBackgroundTicker(onTick: () => void, intervalMs = 1_000): BackgroundTicker {
  if (typeof Worker !== 'undefined') {
    try {
      const worker = new Worker(new URL('./backgroundTicker.worker.ts', import.meta.url), {
        type: 'module',
        name: 'framefr-background-updates',
      })
      worker.onmessage = () => onTick()
      worker.postMessage({ type: 'start', intervalMs })
      return {
        stop: () => {
          worker.onmessage = null
          worker.postMessage({ type: 'stop' })
          worker.terminate()
        },
      }
    } catch {
      // Fall through to a main-thread timer. Some embedded browsers expose a
      // Worker constructor but reject module workers at creation time.
    }
  }

  const timer = globalThis.setInterval(onTick, intervalMs)
  return { stop: () => globalThis.clearInterval(timer) }
}
