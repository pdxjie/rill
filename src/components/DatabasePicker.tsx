import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Database, RefreshCw } from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import { useAppStore } from '../lib/store'
import type { ConnectionView, DatabaseEntry } from '../lib/types'
import { cn, formatInt } from '../lib/utils'
import { IconButton, Spinner } from './ui'

const PANEL_WIDTH = 306

export function DatabasePicker({ conn }: { conn: ConnectionView }) {
  const [open, setOpen] = useState(false)
  const [databases, setDatabases] = useState<DatabaseEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [switching, setSwitching] = useState<number | null>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const switchDb = useAppStore((s) => s.switchDb)

  useEffect(() => {
    setOpen(false)
    setDatabases([])
    setError(null)
    setSwitching(null)
  }, [conn.id])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await api.listDatabases(conn.id)
      setDatabases(list)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onPointer, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const rows = Math.ceil(Math.max(databases.length, 8) / 2)
    const height = Math.min(430, 88 + rows * 37)
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 12))
    let top = rect.bottom + 7
    if (top + height > window.innerHeight - 12) {
      top = Math.max(12, rect.top - height - 7)
    }
    setPosition({ left, top })
  }, [open, databases.length])

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    void load()
  }

  const pick = async (entry: DatabaseEntry) => {
    if (entry.index === conn.db) {
      setOpen(false)
      return
    }
    setSwitching(entry.index)
    try {
      await switchDb(conn.id, entry.index)
      setOpen(false)
    } finally {
      setSwitching(null)
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggle}
        title="切换数据库（SELECT）"
        className={cn(
          'flex h-[23px] items-center gap-1 rounded-[6px] border px-1.5 transition',
          open
            ? 'border-accent/40 bg-accent/10 text-ink'
            : 'border-line bg-panel text-muted hover:border-linestrong hover:text-ink',
        )}
      >
        <Database size={10} className="text-accent" />
        <span className="mono text-[12px] font-medium">db{conn.db}</span>
        <ChevronDown
          size={9}
          className={cn('text-faint transition-transform', open && 'rotate-180')}
        />
      </button>

      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[85] animate-pop-in overflow-hidden rounded-[11px] border border-line bg-elevated shadow-pop"
              style={{ left: position.left, top: position.top, width: PANEL_WIDTH }}
            >
              <div className="flex h-[38px] items-center gap-1.5 border-b border-line/70 px-3">
                <Database size={12} className="text-accent" />
                <span className="text-[12.5px] font-semibold text-ink">选择数据库</span>
                <span className="text-[11.5px] text-faint">
                  {databases.length ? `${databases.length} 个` : ''}
                </span>
                <IconButton
                  icon={RefreshCw}
                  label="刷新数据库列表"
                  className="ml-auto h-6 w-6"
                  onClick={() => void load()}
                />
              </div>

              {loading && !databases.length ? (
                <div className="grid grid-cols-2 gap-1 p-2">
                  {Array.from({ length: 16 }).map((_, index) => (
                    <div key={index} className="h-[33px] animate-pulse rounded-[7px] bg-line/30" />
                  ))}
                </div>
              ) : error ? (
                <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                  <p className="text-[12px] text-red">{error}</p>
                  <button
                    onClick={() => void load()}
                    className="rounded-[6px] border border-line px-2 py-1 text-[12px] text-muted hover:text-ink"
                  >
                    重试
                  </button>
                </div>
              ) : (
                <div className="scroll-area grid max-h-[330px] grid-cols-2 gap-1 p-2">
                  {databases.map((entry) => {
                    const current = entry.index === conn.db
                    return (
                      <button
                        key={entry.index}
                        onClick={() => void pick(entry)}
                        disabled={switching !== null}
                        className={cn(
                          'flex h-[33px] items-center gap-2 rounded-[7px] border px-2 text-left transition disabled:opacity-60',
                          current
                            ? 'border-accent/35 bg-accent/8'
                            : 'border-transparent hover:border-line hover:bg-panel2',
                        )}
                      >
                        <span
                          className={cn(
                            'mono text-[12.5px] font-medium',
                            current ? 'text-accent' : 'text-ink',
                          )}
                        >
                          db{entry.index}
                        </span>
                        <span className="ml-auto text-[11.5px] tabular-nums text-faint">
                          {entry.keys ? formatInt(entry.keys) : '空'}
                        </span>
                        {switching === entry.index ? (
                          <Spinner size={10} className="text-accent" />
                        ) : current ? (
                          <Check size={11} className="text-accent" />
                        ) : (
                          <span className="w-[11px]" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-line/70 px-3 py-1.5 text-[11.5px] text-faint">
                <span>切换只影响当前连接，不会清空数据</span>
                {loading && databases.length ? <Spinner size={9} /> : <span className="mono">SELECT</span>}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
