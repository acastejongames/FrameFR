type TickerMessage = { type?: unknown; intervalMs?: unknown }

interface TickerScope {
  onmessage: ((event: MessageEvent<TickerMessage>) => void) | null
  postMessage: (message: { type: 'tick' }) => void
}

const scope = self as unknown as TickerScope
let timer: ReturnType<typeof setInterval> | undefined

function stop(): void {
  if (timer !== undefined) clearInterval(timer)
  timer = undefined
}

scope.onmessage = (event) => {
  if (event.data?.type !== 'start') {
    stop()
    return
  }

  const requested = typeof event.data.intervalMs === 'number' ? event.data.intervalMs : 1_000
  const intervalMs = Math.min(5_000, Math.max(250, requested))
  stop()
  timer = setInterval(() => scope.postMessage({ type: 'tick' }), intervalMs)
}

export {}
