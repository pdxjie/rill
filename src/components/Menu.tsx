import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  trailing?: ReactNode
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useEffect(() => {
    const width = 196
    const height = items.length * 30 + 12
    setPos({
      left: Math.min(x, window.innerWidth - width - 10),
      top: Math.min(y, window.innerHeight - height - 10),
    })
  }, [x, y, items.length])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const onScroll = () => onClose()
    window.addEventListener('mousedown', onClick, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('mousedown', onClick, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[90] w-[196px] animate-pop-in overflow-hidden rounded-[10px] border border-line bg-elevated p-1 shadow-pop"
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item, index) =>
        item.separator ? (
          <div key={`sep-${index}`} className="mx-1 my-1 h-px bg-line/80" />
        ) : (
          <button
            key={item.label}
            disabled={item.disabled}
            onClick={() => {
              item.onClick()
              onClose()
            }}
            className={cn(
              'flex h-[28px] w-full items-center gap-2 rounded-[6px] px-2 text-left text-[11.5px] transition disabled:opacity-40',
              item.danger
                ? 'text-red hover:bg-red/10'
                : 'text-muted hover:bg-panel2 hover:text-ink',
            )}
          >
            {item.icon ? <item.icon size={12} className="shrink-0" /> : null}
            <span className="flex-1 truncate">{item.label}</span>
            {item.trailing}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}
