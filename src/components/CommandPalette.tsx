import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  Database,
  Keyboard,
  LayoutDashboard,
  Moon,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Server,
  Sun,
  TerminalSquare,
  Timer,
  Unplug,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAppStore, TAB_LABELS } from '../lib/store'
import type { KeyMeta, WorkspaceTab } from '../lib/types'
import { cn, typeMeta } from '../lib/utils'
import { Spinner } from './ui'
import { TypeGlyph } from './TypeGlyph'

interface Action {
  id: string
  label: string
  hint?: string
  section: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  shortcut?: string
  run: () => void
}

const TAB_ICONS: Record<WorkspaceTab, React.ComponentType<{ size?: number; className?: string }>> = {
  overview: LayoutDashboard,
  keys: Database,
  console: TerminalSquare,
  slowlog: Timer,
  pubsub: Radio,
  info: Server,
}

const TAB_ORDER: WorkspaceTab[] = ['overview', 'keys', 'console', 'slowlog', 'pubsub', 'info']

export function CommandPalette() {
  const open = useAppStore((s) => s.paletteOpen)
  const close = useAppStore((s) => s.closePalette)
  const activeId = useAppStore((s) => s.activeId)
  const connections = useAppStore((s) => s.connections)
  const setTab = useAppStore((s) => s.setTab)
  const setActiveKey = useAppStore((s) => s.setActiveKey)
  const selectConnection = useAppStore((s) => s.selectConnection)
  const openModal = useAppStore((s) => s.openModal)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const theme = useAppStore((s) => s.theme)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [keyResults, setKeyResults] = useState<KeyMeta[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const tokenRef = useRef(0)

  const active = connections.find((c) => c.id === activeId)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    setKeyResults([])
    window.setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2 || !active?.connected) {
      setKeyResults([])
      setSearching(false)
      return
    }
    const token = ++tokenRef.current
    setSearching(true)
    const timer = window.setTimeout(async () => {
      try {
        const page = await api.scanKeys(active.id, 0, `*${q}*`, undefined, 30)
        if (token !== tokenRef.current) return
        setKeyResults(page.keys.slice(0, 8))
      } catch {
        if (token === tokenRef.current) setKeyResults([])
      } finally {
        if (token === tokenRef.current) setSearching(false)
      }
    }, 280)
    return () => window.clearTimeout(timer)
  }, [query, open, active?.id, active?.connected])

  const actions = useMemo<Action[]>(() => {
    const list: Action[] = []
    if (active?.connected) {
      for (const tab of TAB_ORDER) {
        const Icon = TAB_ICONS[tab]
        list.push({
          id: `tab-${tab}`,
          label: `打开${TAB_LABELS[tab]}`,
          section: '导航',
          icon: Icon,
          shortcut: `⌘${TAB_ORDER.indexOf(tab) + 1}`,
          run: () => {
            setTab(tab)
            close()
          },
        })
      }
      list.push({
        id: 'refresh',
        label: '刷新当前视图',
        section: '操作',
        icon: RefreshCw,
        shortcut: '⌘R',
        run: () => {
          window.dispatchEvent(new CustomEvent('rill:refresh'))
          close()
        },
      })
    }
    list.push(
      {
        id: 'new-connection',
        label: '新建连接',
        hint: '添加 Redis 实例',
        section: '操作',
        icon: Plus,
        shortcut: '⌘N',
        run: () => {
          close()
          openModal(null)
        },
      },
      {
        id: 'theme',
        label: theme === 'dark' ? '切换到浅色主题' : '切换到深色主题',
        section: '操作',
        icon: theme === 'dark' ? Sun : Moon,
        run: () => {
          toggleTheme()
          close()
        },
      },
      {
        id: 'sidebar',
        label: '收起 / 展开侧栏',
        section: '操作',
        icon: Keyboard,
        shortcut: '⌘B',
        run: () => {
          toggleSidebar()
          close()
        },
      },
    )
    for (const conn of connections) {
      list.push({
        id: `conn-${conn.id}`,
        label: conn.connected ? `切换到 ${conn.name}` : `连接 ${conn.name}`,
        hint: `${conn.host}:${conn.port} · db${conn.db}`,
        section: '连接',
        icon: conn.connected ? ArrowRight : Unplug,
        run: () => {
          close()
          void selectConnection(conn.id)
        },
      })
    }
    return list
  }, [active?.connected, connections, close, openModal, selectConnection, setTab, theme, toggleSidebar])

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter(
      (action) =>
        action.label.toLowerCase().includes(q) ||
        action.hint?.toLowerCase().includes(q) ||
        action.section.toLowerCase().includes(q),
    )
  }, [actions, query])

  const flat: (
    | { kind: 'action'; action: Action }
    | { kind: 'key'; key: KeyMeta }
    | { kind: 'header'; label: string }
  )[] = []
  let lastSection = ''
  for (const action of filteredActions) {
    if (action.section !== lastSection) {
      flat.push({ kind: 'header', label: action.section })
      lastSection = action.section
    }
    flat.push({ kind: 'action', action })
  }
  if (keyResults.length) {
    flat.push({ kind: 'header', label: 'Keys' })
    for (const key of keyResults) flat.push({ kind: 'key', key })
  }
  const selectable = flat.filter((row) => row.kind !== 'header')

  useEffect(() => {
    setIndex(0)
  }, [query, keyResults.length])

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!open) return null

  const choose = (item: (typeof selectable)[number]) => {
    if (item.kind === 'action') {
      item.action.run()
    } else if (item.kind === 'key') {
      setTab('keys')
      setActiveKey(item.key.key)
      close()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-6 pt-[11vh]">
      <div className="absolute inset-0 animate-fade-in bg-black/55 backdrop-blur-[3px]" onClick={close} />
      <div className="relative z-10 w-full max-w-[580px] animate-pop-in overflow-hidden rounded-[14px] border border-line bg-panel2 shadow-pop">
        <div className="flex items-center gap-2.5 border-b border-line/80 px-4">
          <Search size={15} className="shrink-0 text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setIndex((prev) => Math.min(selectable.length - 1, prev + 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setIndex((prev) => Math.max(0, prev - 1))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                const item = selectable[index]
                if (item) choose(item)
              }
            }}
            placeholder="搜索连接、Key 或输入操作…"
            spellCheck={false}
            className="h-[48px] flex-1 border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
          />
          {searching ? <Spinner size={12} className="text-faint" /> : null}
          <span className="kbd">esc</span>
        </div>
        <div ref={listRef} className="scroll-area max-h-[52vh] min-h-[120px] py-1.5">
          {selectable.length === 0 ? (
            <div className="px-4 py-10 text-center text-[11px] text-faint">
              没有匹配 “{query}” 的结果
            </div>
          ) : (
            flat.map((row, i) => {
              if (row.kind === 'header') {
                return (
                  <div
                    key={`h-${row.label}-${i}`}
                    className="px-4 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-faint"
                  >
                    {row.label}
                  </div>
                )
              }
              const selectableIndex = selectable.indexOf(row)
              const activeRow = selectableIndex === index
              if (row.kind === 'action') {
                const Icon = row.action.icon
                return (
                  <button
                    key={row.action.id}
                    data-index={selectableIndex}
                    onMouseEnter={() => setIndex(selectableIndex)}
                    onClick={() => choose(row)}
                    className={cn(
                      'mx-1.5 flex h-[34px] w-[calc(100%-12px)] items-center gap-2.5 rounded-[7px] px-2.5 text-left transition',
                      activeRow ? 'bg-elevated text-ink' : 'text-muted hover:bg-elevated/60 hover:text-ink',
                    )}
                  >
                    <Icon size={13} className={activeRow ? 'text-accent' : 'text-faint'} />
                    <span className="flex-1 truncate text-[12px]">{row.action.label}</span>
                    {row.action.hint ? (
                      <span className="truncate mono text-[9.5px] text-faint">{row.action.hint}</span>
                    ) : null}
                    {row.action.shortcut ? <span className="kbd">{row.action.shortcut}</span> : null}
                  </button>
                )
              }
              const meta = typeMeta(row.key.keyType)
              return (
                <button
                  key={row.key.key}
                  data-index={selectableIndex}
                  onMouseEnter={() => setIndex(selectableIndex)}
                  onClick={() => choose(row)}
                  className={cn(
                    'mx-1.5 flex h-[34px] w-[calc(100%-12px)] items-center gap-2.5 rounded-[7px] px-2.5 text-left transition',
                    activeRow ? 'bg-elevated' : 'hover:bg-elevated/60',
                  )}
                >
                  <TypeGlyph type={row.key.keyType} size={18} />
                  <span className="min-w-0 flex-1 truncate mono text-[11.5px] text-ink">{row.key.key}</span>
                  <span className="text-[9px] font-medium" style={{ color: meta.color }}>
                    {meta.short}
                  </span>
                  {row.key.ttl >= 0 ? <span className="text-[9px] text-faint">ttl {row.key.ttl}s</span> : null}
                </button>
              )
            })
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-line/70 px-4 py-2 text-[9.5px] text-faint">
          <span className="flex items-center gap-1">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> 选择
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">↵</span> 打开
          </span>
          <span className="ml-auto">{active ? `${active.name} · 已连接` : '未连接'}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
