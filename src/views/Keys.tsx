import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ChevronDown,
  ChevronRight,
  List,
  ListTree,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  SearchX,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '../lib/api'
import { useActiveConnection, useAppStore } from '../lib/store'
import type { KeyMeta, NamespaceTreeResult, RedisType } from '../lib/types'
import {
  cn,
  formatBytes,
  formatInt,
  formatTtl,
  fuzzyMatch,
  globToRegex,
  highlightParts,
  normalizePattern,
} from '../lib/utils'
import { TypeGlyph } from '../components/TypeGlyph'
import { Button, EmptyState, IconButton, Input, Modal, ModalHeader, Segmented, Skeleton, Spinner, Tip } from '../components/ui'
import { NamespaceTree } from '../components/NamespaceTree'
import { ValuePanel } from './ValuePanel'

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '全部类型' },
  { value: 'string', label: 'String' },
  { value: 'hash', label: 'Hash' },
  { value: 'list', label: 'List' },
  { value: 'set', label: 'Set' },
  { value: 'zset', label: 'Sorted Set' },
  { value: 'stream', label: 'Stream' },
]

export function KeysView() {
  const conn = useActiveConnection()
  const activeKey = useAppStore((s) => s.activeKey)
  const setActiveKey = useAppStore((s) => s.setActiveKey)

  const [patternInput, setPatternInput] = useState('')
  const [pattern, setPattern] = useState('*')
  const [typeFilter, setTypeFilter] = useState('all')
  const [keys, setKeys] = useState<KeyMeta[]>([])
  const [cursor, setCursor] = useState(0)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'list' | 'tree'>('list')
  const [listWidth, setListWidth] = useState(340)
  const [createOpen, setCreateOpen] = useState(false)
  const [tree, setTree] = useState<NamespaceTreeResult | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [treeScanning, setTreeScanning] = useState(false)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [treeVersion, setTreeVersion] = useState(0)
  const [treeProgress, setTreeProgress] = useState({ scanned: 0, total: 0 })

  const requestId = useRef(0)
  const treeRunRef = useRef(0)
  const treeAccumulator = useRef(
    new Map<string, { name: string; depth: number; count: number; direct: number }>(),
  )
  const treeScannedRef = useRef(0)
  const treeRootRef = useRef(0)
  const treeTotalRef = useRef(0)
  const treeCursorRef = useRef(0)
  const treeDoneRef = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const scopeKey = `${conn?.id ?? ''}|${conn?.db ?? 0}|${typeFilter}`
  const scopeRef = useRef(scopeKey)
  const localQuery = patternInput.trim()
  const hasGlob = /[*?]/.test(localQuery)
  const displayKeys = useMemo(() => {
    if (!localQuery) return keys
    if (hasGlob) {
      try {
        const matcher = globToRegex(normalizePattern(localQuery))
        return keys.filter((item) => matcher.test(item.key))
      } catch {
        return keys
      }
    }
    return keys.filter((item) => fuzzyMatch(item.key, localQuery))
  }, [keys, localQuery, hasGlob])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPattern(normalizePattern(patternInput))
    }, 280)
    return () => window.clearTimeout(timer)
  }, [patternInput])

  const loadFirst = useCallback(async () => {
    if (!conn) return
    const token = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const page = await api.scanKeys(conn.id, 0, pattern, typeFilter, 200)
      if (token !== requestId.current) return
      setKeys((previous) => {
        // A filtered SCAN should not throw away keys already on screen: fuzzy
        // matching is client-side and can be broader than Redis MATCH.
        if (pattern === '*' || previous.length === 0) return page.keys
        const seen = new Set(previous.map((item) => item.key))
        return [...previous, ...page.keys.filter((item) => !seen.has(item.key))]
      })
      setCursor(page.cursor)
      setDone(page.done)
    } catch (err) {
      if (token !== requestId.current) return
      setError(errorMessage(err))
      setKeys([])
    } finally {
      if (token === requestId.current) setLoading(false)
    }
  }, [conn, pattern, typeFilter])

  useEffect(() => {
    if (scopeRef.current !== scopeKey) {
      scopeRef.current = scopeKey
      setKeys([])
      setCursor(0)
      setDone(false)
    }
    void loadFirst()
  }, [loadFirst, scopeKey])

  const resetTreeScan = useCallback(() => {
    treeAccumulator.current.clear()
    treeScannedRef.current = 0
    treeRootRef.current = 0
    treeTotalRef.current = 0
    treeCursorRef.current = 0
    treeDoneRef.current = false
    setTreeProgress({ scanned: 0, total: 0 })
  }, [])

  const mergeTreeChunk = useCallback((result: NamespaceTreeResult) => {
    for (const entry of result.entries) {
      const existing = treeAccumulator.current.get(entry.path)
      if (existing) {
        existing.count += entry.count
        existing.direct += entry.direct
      } else {
        treeAccumulator.current.set(entry.path, {
          name: entry.name,
          depth: entry.depth,
          count: entry.count,
          direct: entry.direct,
        })
      }
    }
    treeScannedRef.current += result.scanned
    treeRootRef.current += result.rootKeys
    treeTotalRef.current = result.totalKeys
    treeCursorRef.current = result.cursor
    treeDoneRef.current = result.done
    setTreeProgress({ scanned: treeScannedRef.current, total: result.totalKeys })
  }, [])

  const snapshotTree = useCallback((): NamespaceTreeResult => {
    const entries = [...treeAccumulator.current.entries()]
      .map(([path, value]) => ({
        path,
        name: value.name,
        depth: value.depth,
        count: value.count,
        direct: value.direct,
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
    return {
      entries: entries.slice(0, 8000),
      scanned: treeScannedRef.current,
      rootKeys: treeRootRef.current,
      truncated: entries.length > 8000,
      cursor: treeCursorRef.current,
      done: treeDoneRef.current,
      totalKeys: treeTotalRef.current,
    }
  }, [])

  const loadTree = useCallback(async () => {
    if (!conn) return
    const run = ++treeRunRef.current
    resetTreeScan()
    setTree(null)
    setTreeLoading(true)
    setTreeScanning(false)
    setTreeError(null)
    try {
      const result = await api.namespaceTree(
        conn.id,
        pattern === '*' ? undefined : pattern,
        100_000,
        0,
        2_000,
      )
      if (run !== treeRunRef.current) return
      mergeTreeChunk(result)
      setTree(snapshotTree())
    } catch (err) {
      if (run === treeRunRef.current) setTreeError(errorMessage(err))
    } finally {
      if (run === treeRunRef.current) setTreeLoading(false)
    }
  }, [conn?.id, conn?.db, pattern, resetTreeScan, mergeTreeChunk, snapshotTree])

  const scanAllTree = useCallback(async () => {
    if (!conn || treeDoneRef.current) return
    const run = ++treeRunRef.current
    setTreeScanning(true)
    setTreeError(null)
    try {
      while (!treeDoneRef.current) {
        const result = await api.namespaceTree(
          conn.id,
          pattern === '*' ? undefined : pattern,
          100_000,
          treeCursorRef.current,
          2_000,
        )
        if (run !== treeRunRef.current) return
        mergeTreeChunk(result)
      }
      setTree(snapshotTree())
    } catch (err) {
      if (run === treeRunRef.current) setTreeError(errorMessage(err))
    } finally {
      if (run === treeRunRef.current) setTreeScanning(false)
    }
  }, [conn?.id, conn?.db, pattern, mergeTreeChunk, snapshotTree])

  const stopTreeScan = useCallback(() => {
    treeRunRef.current += 1
    setTreeScanning(false)
    setTree(snapshotTree())
  }, [snapshotTree])

  useEffect(() => () => {
    treeRunRef.current += 1
  }, [])

  useEffect(() => {
    if (mode === 'tree') void loadTree()
  }, [mode, loadTree])

  const loadTreeKeys = useCallback(
    async (prefix: string, cursor: number, limit = 200) => {
      if (!conn) return { keys: [], cursor: 0, done: true }
      return api.prefixKeys(conn.id, prefix, cursor, limit)
    },
    [conn?.id, conn?.db],
  )

  useEffect(() => {
    if (mode !== 'tree') return
    const handler = () => void loadTree()
    window.addEventListener('rill:refresh', handler)
    return () => window.removeEventListener('rill:refresh', handler)
  }, [mode, loadTree])

  useEffect(() => {
    const handler = () => {
      void loadFirst()
      window.dispatchEvent(new CustomEvent('rill:refresh-value'))
    }
    window.addEventListener('rill:refresh', handler)
    return () => window.removeEventListener('rill:refresh', handler)
  }, [loadFirst])

  const loadMore = useCallback(async () => {
    if (!conn || done || loadingMore || loading || cursor === 0) return
    setLoadingMore(true)
    const token = requestId.current
    try {
      const page = await api.scanKeys(conn.id, cursor, pattern, typeFilter, 200)
      if (token !== requestId.current) return
      setKeys((prev) => {
        const seen = new Set(prev.map((k) => k.key))
        return [...prev, ...page.keys.filter((k) => !seen.has(k.key))]
      })
      setCursor(page.cursor)
      setDone(page.done)
    } catch (err) {
      toast.error('加载更多失败', { description: errorMessage(err) })
    } finally {
      setLoadingMore(false)
    }
  }, [conn, done, loadingMore, loading, cursor, pattern, typeFilter])

  const virtualizer = useVirtualizer({
    count: displayKeys.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 42,
    overscan: 12,
  })

  useEffect(() => {
    if (!activeKey) return
    const index = displayKeys.findIndex((item) => item.key === activeKey)
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' })
  }, [activeKey, displayKeys.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const startResize = (event: React.MouseEvent) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = listWidth
    const onMove = (moveEvent: MouseEvent) => {
      setListWidth(Math.max(280, Math.min(520, startWidth + moveEvent.clientX - startX)))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const selectKey = (key: string) => {
    setActiveKey(key)
  }

  const moveSelection = (delta: number) => {
    if (!displayKeys.length) return
    const index = displayKeys.findIndex((k) => k.key === activeKey)
    const next = Math.max(0, Math.min(displayKeys.length - 1, (index < 0 ? 0 : index) + delta))
    selectKey(displayKeys[next].key)
    virtualizer.scrollToIndex(next, { align: 'auto' })
  }

  if (!conn) return null

  return (
    <div className="flex h-full min-w-0">
      <div className="flex min-w-0 flex-col border-r border-line/70" style={{ width: listWidth }}>
        <div className="flex flex-col gap-2 border-b border-line/70 p-2.5">
          <div className="flex items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
              <input
                ref={searchRef}
                value={patternInput}
                onChange={(event) => setPatternInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    const next = normalizePattern(patternInput)
                    if (next === pattern) void loadFirst()
                    else setPattern(next)
                  }
                  if (event.key === 'Escape') {
                    setPatternInput('')
                    setPattern('*')
                  }
                }}
                placeholder="模糊筛选 Key，支持 * 通配"
                spellCheck={false}
                className="field h-[30px] pl-7 pr-10 mono text-[12.5px]"
              />
              <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                {loading && keys.length > 0 ? <Spinner size={10} className="text-faint" /> : null}
                {patternInput ? (
                  <button
                    className="flex h-4 w-4 items-center justify-center rounded text-faint hover:text-ink"
                    onClick={() => {
                      setPatternInput('')
                      setPattern('*')
                    }}
                  >
                    <X size={11} />
                  </button>
                ) : null}
              </div>
            </div>
            <Tip label="新建 Key">
              <button
                onClick={() => setCreateOpen(true)}
                disabled={conn.readOnly}
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-accent text-white shadow-[0_6px_16px_-8px_rgba(255,107,87,.8)] transition hover:brightness-110 disabled:opacity-40"
              >
                <Plus size={15} />
              </button>
            </Tip>
          </div>
          <div className="flex items-center justify-between gap-1">
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                className="h-[24px] w-[92px] appearance-none rounded-[6px] border border-line bg-panel pl-2 pr-5 text-[12px] leading-none text-muted outline-none transition hover:text-ink"
              >
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={10} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-faint" />
            </div>
            <div className="flex items-center gap-0.5">
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'list', label: <List size={11} />, ariaLabel: '列表视图' },
                  { value: 'tree', label: <ListTree size={11} />, ariaLabel: '命名空间树' },
                ]}
              />
              <IconButton icon={RefreshCw} label="刷新" onClick={() => void loadFirst()} className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div
          ref={listRef}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              moveSelection(1)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              moveSelection(-1)
            } else if (event.key === 'Enter' && activeKey) {
              event.preventDefault()
              selectKey(activeKey)
            } else if (event.key === '/') {
              event.preventDefault()
              searchRef.current?.focus()
            }
          }}
          onScroll={(event) => {
            if (mode === 'tree') return
            const el = event.currentTarget
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 320) void loadMore()
          }}
          className="relative min-h-0 flex-1 overflow-y-auto outline-none"
        >
          {mode === 'tree' ? (
            <NamespaceTree
              data={tree}
              loading={treeLoading}
              error={treeError}
              scopeKey={`${conn?.id ?? ''}:${conn?.db ?? 0}:${pattern}`}
              refreshToken={treeVersion}
              activeKey={activeKey}
              scanning={treeScanning}
              progress={treeProgress}
              filtered={pattern !== '*'}
              onScanAll={() => void scanAllTree()}
              onStopScan={stopTreeScan}
              onRetry={() => void loadTree()}
              onSelectKey={(key) => setActiveKey(key)}
              loadKeys={loadTreeKeys}
              onFilter={(prefix) => {
                setPatternInput(`${prefix}:*`)
                setPattern(`${prefix}:*`)
                setMode('list')
              }}
            />
          ) : loading && keys.length === 0 ? (
            <div className="flex flex-col gap-1 p-2">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 px-1 py-1.5">
                  <Skeleton className="h-5 w-5 rounded-md" />
                  <div className="flex flex-1 flex-col gap-1">
                    <Skeleton className="h-2.5" style={{ width: `${45 + ((i * 17) % 45)}%` }} />
                    <Skeleton className="h-2 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <EmptyState
              icon={SearchX}
              compact
              title="扫描失败"
              description={error}
              action={
                <Button size="sm" icon={RefreshCw} onClick={() => void loadFirst()}>
                  重试
                </Button>
              }
            />
          ) : loading && keys.length > 0 && displayKeys.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Spinner size={16} className="text-accent" />
              <p className="text-[12.5px] text-muted">正在全库扫描匹配的 Key…</p>
              <p className="text-[11.5px] text-faint">SCAN 会分批返回，稍等片刻</p>
            </div>
          ) : displayKeys.length === 0 ? (
            <EmptyState
              icon={SearchX}
              compact
              title={keys.length ? '已加载的 Key 中没有匹配项' : '没有匹配的 Key'}
              description={
                keys.length
                  ? '可以继续扫描剩余的键空间，或换个关键词'
                  : patternInput
                    ? `没有找到与 “${patternInput}” 匹配的 Key`
                    : '当前数据库是空的'
              }
              action={
                <div className="flex items-center gap-2">
                  {!done ? (
                    <Button size="sm" variant="secondary" loading={loadingMore} onClick={() => void loadMore()}>
                      继续扫描
                    </Button>
                  ) : null}
                  {patternInput ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setPatternInput('')
                        setPattern('*')
                      }}
                    >
                      清除筛选
                    </Button>
                  ) : (
                    <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
                      新建 Key
                    </Button>
                  )}
                </div>
              }
            />
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((row) => {
                const item = displayKeys[row.index]
                const active = item.key === activeKey
                return (
                  <div
                    key={item.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: row.size,
                      transform: `translateY(${row.start}px)`,
                    }}
                  >
                    <button
                      onClick={() => selectKey(item.key)}
                      className={cn(
                        'group relative flex h-[42px] w-full items-center gap-2 px-2.5 text-left transition-colors',
                        active ? 'bg-elevated' : 'hover:bg-panel2/80',
                      )}
                    >
                      {active ? <span className="absolute inset-y-1.5 left-0 w-[2px] rounded-r bg-accent" /> : null}
                      <TypeGlyph type={item.keyType} size={20} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate mono text-[12.5px] leading-[15px] text-ink" title={item.key}>
                          {highlightParts(item.key, patternInput || pattern).map((part, i) =>
                            part.hit ? (
                              <span key={i} className="rounded-[2px] bg-accent/15 text-accent">
                                {part.text}
                              </span>
                            ) : (
                              <span key={i}>{part.text}</span>
                            ),
                          )}
                        </div>
                        <div className="mt-[2px] flex items-center gap-1.5 text-[11.5px] leading-[12px] text-faint">
                          <span className={cn(item.ttl >= 0 && item.ttl < 300 && 'text-amber/90')}>
                            {formatTtl(item.ttl)}
                          </span>
                          {item.size ? (
                            <>
                              <span className="text-faint/50">·</span>
                              <span className="tabular-nums">{formatBytes(item.size)}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex h-[30px] shrink-0 items-center justify-between border-t border-line/70 bg-panel/40 px-3 text-[12px] text-faint">
          {mode === 'tree' ? (
            <>
              <span className="flex items-center gap-1.5">
                <span
                  className={`h-1 w-1 rounded-full ${tree?.truncated ? 'bg-amber' : 'bg-green'}`}
                />
                命名空间 · 扫描 {formatInt(tree?.scanned ?? 0)} 个 Key
              </span>
              <span className="mono">{tree?.truncated ? 'PARTIAL' : 'FULL SCAN'}</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                {done ? (
                  <>
                    <span className="h-1 w-1 rounded-full bg-green" /> 已加载 {formatInt(keys.length)} 个
                    {localQuery ? ` · 匹配 ${formatInt(displayKeys.length)}` : ''}
                  </>
                ) : (
                  <>
                    <ScanLine size={10} className="text-amber" /> 已加载 {formatInt(keys.length)} · 未扫描完
                    {localQuery ? ` · 匹配 ${formatInt(displayKeys.length)}` : ''}
                  </>
                )}
              </span>
              {!done ? (
                <button
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="flex items-center gap-1 text-muted transition hover:text-ink disabled:opacity-50"
                >
                  {loadingMore ? '加载中…' : '继续扫描'}
                  <ChevronRight size={10} />
                </button>
              ) : (
                <span className="mono">SCAN · 非阻塞</span>
              )}
            </>
          )}
        </div>
      </div>

      <div
        onMouseDown={startResize}
        className="group relative w-[3px] shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-accent/25"
      >
        <span className="absolute inset-y-0 -left-1 -right-1" />
      </div>

      <div className="min-w-0 flex-1">
        <ValuePanel
          connection={conn}
          redisKey={activeKey}
          onDeleted={() => {
            setActiveKey(null)
            void loadFirst()
            if (mode === 'tree') {
              setTreeVersion((value) => value + 1)
              void loadTree()
            }
          }}
          onRenamed={(next) => {
            setActiveKey(next)
            void loadFirst()
            if (mode === 'tree') {
              setTreeVersion((value) => value + 1)
              void loadTree()
            }
          }}
          onMetaChanged={() => {
            if (mode === 'tree') setTreeVersion((value) => value + 1)
          }}
        />
      </div>

      <CreateKeyModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={async (name, kind) => {
          try {
            await api.createKey(conn.id, name, kind)
            toast.success('Key 已创建', { description: name })
            setCreateOpen(false)
            await loadFirst()
            setActiveKey(name)
          } catch (err) {
            toast.error('创建失败', { description: errorMessage(err) })
          }
        }}
      />
    </div>
  )
}

function CreateKeyModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (name: string, kind: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<RedisType>('string')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setKind('string')
    }
  }, [open])

  const kinds: { value: RedisType; label: string }[] = [
    { value: 'string', label: 'String' },
    { value: 'hash', label: 'Hash' },
    { value: 'list', label: 'List' },
    { value: 'set', label: 'Set' },
    { value: 'zset', label: 'Sorted Set' },
    { value: 'stream', label: 'Stream' },
  ]

  return (
    <Modal open={open} onClose={onClose} width={480}>
      <ModalHeader
        icon={Plus}
        title="新建 Key"
        description="创建后会自动填充一个初始元素，方便立即编辑。"
        onClose={onClose}
      />
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Key 名称</label>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如 cache:user:1001"
            className="mono"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && name.trim()) {
                setBusy(true)
                void onCreate(name.trim(), kind).finally(() => setBusy(false))
              }
            }}
          />
          <span className="text-[12px] text-faint">建议使用冒号分隔命名空间，键空间视图会自动聚合。</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">数据类型</label>
          <div className="grid grid-cols-3 gap-1.5">
            {kinds.map((option) => (
              <button
                key={option.value}
                onClick={() => setKind(option.value)}
                className={cn(
                  'flex items-center gap-2 rounded-[8px] border px-2.5 py-2 text-left text-xs transition',
                  kind === option.value
                    ? 'border-accent/45 bg-accent/8 text-ink'
                    : 'border-line bg-panel text-muted hover:border-linestrong hover:text-ink',
                )}
              >
                <TypeGlyph type={option.value} size={20} />
                {option.label}
                {kind === option.value ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" /> : null}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            icon={Plus}
            loading={busy}
            disabled={!name.trim()}
            onClick={async () => {
              setBusy(true)
              try {
                await onCreate(name.trim(), kind)
              } finally {
                setBusy(false)
              }
            }}
          >
            创建
          </Button>
        </div>
      </div>
    </Modal>
  )
}
