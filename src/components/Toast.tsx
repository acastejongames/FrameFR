import { useEffect, useState } from 'react'

interface ToastProps {
  /** Message to display. */
  message: string | null
  /** Milliseconds the message stays visible. */
  duration?: number
}

/** Transient notification shown at the top of the screen. */
export function Toast({ message, duration = 2800 }: ToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!message) return
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), duration)
    return () => clearTimeout(timer)
  }, [message, duration])

  return (
    <div
      className={`pointer-events-none fixed left-1/2 top-14 z-50 -translate-x-1/2 transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      data-clean-hide
      role="status"
      aria-live="polite"
    >
      <div className="panel-raised flex items-center gap-2 rounded-md border-l-4 border-l-accent px-3.5 py-1.5 text-xs font-medium text-white">
        {message}
      </div>
    </div>
  )
}
