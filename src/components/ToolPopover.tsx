import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Non-modal, keyboard-accessible map tool. Keeps the map usable behind it. */
export function ToolPopover({
  id,
  title,
  subtitle,
  open,
  onClose,
  trigger,
  children,
}: {
  id: string
  title: string
  subtitle: string
  open: boolean
  onClose: () => void
  trigger: ReactNode
  children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    close.current?.focus()
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onClose()
    }
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
      root.current?.querySelector<HTMLButtonElement>('[aria-controls]')?.focus()
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', key, true)
    }
  }, [open, onClose])
  return (
    <div ref={root} className="tool-anchor">
      {trigger}
      <section
        id={id}
        role="dialog"
        aria-labelledby={`${id}-title`}
        hidden={!open}
        className="tool-popover panel-raised"
      >
        <div className="tool-popover-heading">
          <div>
            <h2 id={`${id}-title`}>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button
            ref={close}
            type="button"
            className="tool-close"
            aria-label={`Cerrar ${title}`}
            onClick={() => {
              onClose()
              root.current?.querySelector<HTMLButtonElement>('[aria-controls]')?.focus()
            }}
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}
