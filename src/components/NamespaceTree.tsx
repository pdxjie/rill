import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Layers,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react'
import type {
  KeyMeta,
  NamespaceEntry,
  NamespaceTreeResult,
  ScanPage,
} from '../lib/types'
import { cn, formatInt, formatTtl } from '../lib/utils'
import { TypeGlyph } from './TypeGlyph'
import { Button, EmptyState, IconButton, Skeleton, Spinner, Tip } from './ui'

interface TreeNode {
  entry: NamespaceEntry
  children: TreeNode[]
}

interface PrefixState {
  keys: KeyMeta[]
  cursor: number
  done: boolean
  loading: boolean
  error?: string
}

type Row =
  | { kind: 'folder'; node: TreeNode; depth: number }
  | { kind: 'key'; key: KeyMeta; depth: number }
  | {
      kind: 'status'
      prefix: string
      depth: number
      status: 'loading' | 'more' | 'error' | 'empty'
      message?: string
    }

export function NamespaceTree({
  data,
  loading,
  error,
  scopeKey,
  refreshToken,
  activeKey,
  scanning,
  progress,
  filtered,
  onScanAll,
  onStopScan,
  onRetry,
  onFilter,
  onSelectKey,
  loadKeys,
}: {
  data: NamespaceTreeResult | null
  loading: boolean
  error: string | null
  scopeKey: string
  refreshToken: number
  activeKey: string | null
  scanning: boolean
  progress: { scanned: number; total: number }
  filtered: boolean
  onScanAll: () => void
  onStopScan: () => void
  onRetry: () => void
  onFilter: (prefix: string) => void
  onSelectKey: (key: string) => void
  loadKeys: (prefix: string, cursor: number, limit?: number) => Promise<ScanPage>
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [prefixes, setPrefixes] = useState<Record<string, PrefixState>>({})
  const prefixRef = useRef<Record<string, PrefixState>>({})
  const scopeRef = useRef(scopeKey)

  const { roots, nodeMap } = useMemo(() => {
    if (!data) return { roots: [] as TreeNode[], nodeMap: new Map<string, TreeNode>() }
    const map = new Map<string, TreeNode>()
    const sorted = [...data.entries].sort(
      (a, b) => a.depth - b.depth || a.path.localeCompare(b.path),
    )
    for (const entry of sorted) {
      map.set(entry.path, { entry, children: [] })
    }
    const result: TreeNode[] = []
    for (const entry of sorted) {
      const node = map.get(entry.path)!
      const separator = entry.path.lastIndexOf(':')
      const parent = separator > 0 ? map.get(entry.path.slice(0, separator)) : undefined
      if (parent) parent.children.push(node)
      else result.push(node)
    }
    for (const node of map.values()) {
      node.children.sort((a, b) => b.entry.count - a.entry.count)
    }
    return { roots: result, nodeMap: map }
  }, [data])

  useEffect(() => {
    if (scopeRef.current === scopeKey) return
    scopeRef.current = scopeKey
    setExpanded(new Set())
    prefixRef.current = {}
    setPrefixes({})
  }, [scopeKey])

  useEffect(() => {
    if (!data) return
    // Keep the tree compact and stable: folders are expanded by the user.
    // Key rows are loaded lazily for expanded prefixes only.
    prefixRef.current = {}
    setPrefixes({})
  }, [data])

  useEffect(() => {
    prefixRef.current = {}
    setPrefixes({})
  }, [refreshToken])

  const loadPrefix = useCallback(
    async (path: string, mode: 'ensure' | 'more') => {
      const current = prefixRef.current[path]
      const direct = nodeMap.get(path)?.entry.direct ?? 0
      if (current?.loading) return
      if (direct === 0) {
        const update = (next: PrefixState) => {
          prefixRef.current = { ...prefixRef.current, [path]: next }
          setPrefixes({ ...prefixRef.current })
        }
        update({ keys: [], cursor: 0, done: true, loading: false })
        return
      }
      if (mode === 'ensure' && current) return
      const base = mode === 'ensure' ? [] : current?.keys ?? []
      const cursor = mode === 'ensure' ? 0 : current?.cursor ?? 0
      const update = (next: PrefixState) => {
        prefixRef.current = { ...prefixRef.current, [path]: next }
        setPrefixes({ ...prefixRef.current })
      }
      update({ keys: base, cursor, done: false, loading: true })
      try {
        const remaining = Math.max(1, direct - base.length)
        const page = await loadKeys(path, cursor, Math.min(200, remaining))
        const seen = new Set(base.map((key) => key.key))
        const merged = [...base, ...page.keys.filter((key) => !seen.has(key.key))]
        // Stop as soon as every direct key of this namespace is loaded.
        // The SCAN cursor can still point at deeper child namespaces; that
        // must not keep "load more" alive forever.
        const complete = merged.length >= direct
        update({
          keys: merged,
          cursor: complete ? 0 : page.cursor,
          done: complete || page.done,
          loading: false,
        })
      } catch (err) {
        update({
          keys: base,
          cursor,
          done: false,
          loading: false,
          error: String(err),
        })
      }
    },
    [loadKeys, nodeMap],
  )

  useEffect(() => {
    for (const path of expanded) {
      if ((nodeMap.get(path)?.entry.direct ?? 0) > 0) {
        void loadPrefix(path, 'ensure')
      }
    }
  }, [expanded, nodeMap, loadPrefix, refreshToken])

  const rows = useMemo(() => {
    const output: Row[] = []
    const walk = (node: TreeNode, depth: number) => {
      const path = node.entry.path
      output.push({ kind: 'folder', node, depth })
      if (!expanded.has(path)) return
      for (const child of node.children) walk(child, depth + 1)
      if (node.entry.direct === 0) return

      const state = prefixes[path]
      if (!state) {
        output.push({ kind: 'status', prefix: path, depth: depth + 1, status: 'loading' })
        return
      }
      for (const key of state.keys) {
        output.push({ kind: 'key', key, depth: depth + 1 })
      }
      if (state.error) {
        output.push({
          kind: 'status',
          prefix: path,
          depth: depth + 1,
          status: 'error',
          message: state.error,
        })
      } else if (state.loading) {
        output.push({ kind: 'status', prefix: path, depth: depth + 1, status: 'loading' })
      } else if (!state.done) {
        output.push({ kind: 'status', prefix: path, depth: depth + 1, status: 'more' })
      } else if (state.keys.length === 0 && node.children.length === 0) {
        output.push({ kind: 'status', prefix: path, depth: depth + 1, status: 'empty' })
      }
    }
    for (const root of roots) walk(root, 0)
    return output
  }, [roots, expanded, prefixes])

  if (!data && loading) {
    return (
      <div className="flex flex-col gap-1 p-2">
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-2">
          <Skeleton className="h-3 w-3 rounded" />
          <Skeleton className="h-3 w-36" />
          <Skeleton className="ml-auto h-5 w-12" />
        </div>
        {Array.from({ length: 10 }).map((_, index) => (
          <div key={index} className="flex items-center gap-2 px-2 py-1.5">
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3" style={{ width: `${35 + ((index * 19) % 40)}%` }} />
            <Skeleton className="ml-auto h-4 w-8" />
          </div>
        ))}
      </div>
    )
  }

  if (!data && error) {
    return (
      <EmptyState
        icon={Layers}
        compact
        title="命名空间扫描失败"
        description={error}
        action={
          <Button size="sm" icon={RefreshCw} onClick={onRetry}>
            重试
          </Button>
        }
      />
    )
  }

  if (!data) return null

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-[2] border-b border-line/70 bg-panel2/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-1.5">
          <Layers size={12} className="text-accent" />
          <span className="text-[12.5px] font-semibold text-ink">命名空间</span>
          <span className="text-[11.5px] tabular-nums text-faint">
            {formatInt(data.entries.length)} 节点
          </span>
          {data.done ? (
            <span className="rounded-[3px] bg-green/10 px-1 text-[11.5px] text-green">完整</span>
          ) : (
            <span className="rounded-[3px] bg-amber/10 px-1 text-[11.5px] text-amber">部分</span>
          )}
          {loading || scanning ? (
            <RefreshCw size={10} className="animate-spin text-faint" />
          ) : null}
          <IconButton
            icon={RefreshCw}
            label="重新扫描命名空间"
            className="ml-auto h-6 w-6"
            onClick={onRetry}
          />
        </div>

        <div className="mt-1 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[11.5px] tabular-nums text-muted">
            {filtered ? (
              <>已扫描 {formatInt(progress.scanned || data.scanned)} 个匹配 Key</>
            ) : (
              <>
                已扫描 {formatInt(progress.scanned || data.scanned)} /{' '}
                {formatInt(progress.total || data.totalKeys)}
                {progress.total > 0 ? (
                  <span className="text-faint">{' · '}
                    {Math.min(100, ((progress.scanned || data.scanned) / progress.total) * 100) < 0.1 &&
                    (progress.scanned || data.scanned) > 0
                      ? '<0.1%'
                      : `${Math.min(100, ((progress.scanned || data.scanned) / progress.total) * 100).toFixed(1)}%`}
                  </span>
                ) : null}
              </>
            )}
          </span>
          {!data.done ? (
            scanning ? (
              <button
                onClick={onStopScan}
                className="shrink-0 rounded-[5px] border border-line bg-panel px-1.5 py-[2px] text-[11.5px] text-muted transition hover:bg-elevated hover:text-ink"
              >
                停止
              </button>
            ) : (
              <button
                onClick={onScanAll}
                className="shrink-0 rounded-[5px] border border-accent/30 bg-accent/10 px-1.5 py-[2px] text-[11.5px] font-medium text-accent transition hover:bg-accent/15"
              >
                扫描完整
              </button>
            )
          ) : null}
        </div>

        {!data.done && !filtered ? (
          <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-line/60">
            <div
              className="h-full rounded-full bg-accent/70 transition-[width] duration-500"
              style={{
                width: filtered
                  ? '100%'
                  : `${Math.min(100, Math.max(2, ((progress.scanned || data.scanned) / Math.max(1, progress.total || data.totalKeys)) * 100))}%`,
              }}
            />
          </div>
        ) : null}

        <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
          基于当前筛选条件的 SCAN 聚合；展开文件夹加载直属 Key，选中 Key 在右侧查看、编辑或删除。
          {data.rootKeys > 0 ? ` 另有 ${formatInt(data.rootKeys)} 个根级 Key。` : ''}
        </p>
        {!data.done ? (
          <div className="mt-1 text-[11.5px] leading-relaxed text-amber/90">
            {scanning
              ? '正在后台分批扫描剩余 Key，计数会随进度增长；期间可继续浏览已加载的命名空间。'
              : '当前只是部分结果。点「扫描完整」继续扫描，或输入更具体的前缀缩小范围。'}
          </div>
        ) : null}
        {data.truncated ? (
          <div className="mt-1.5 flex items-start gap-1.5 rounded-[6px] border border-amber/20 bg-amber/5 px-2 py-1 text-[11.5px] leading-relaxed text-amber">
            <AlertTriangle size={10} className="mt-[1px] shrink-0" />
            节点数量超过 8000，树中只展示前 8000 个命名空间；可输入更具体的前缀缩小范围。
          </div>
        ) : null}
        {error ? <div className="mt-1.5 text-[11.5px] text-red">{error}</div> : null}
      </div>

      {rows.map((row) => {
        if (row.kind === 'folder') {
          const { node, depth } = row
          const { entry } = node
          const hasChildren = node.children.length > 0
          const open = expanded.has(entry.path)
          const state = prefixes[entry.path]
          return (
            <div
              key={`folder:${entry.path}`}
              className="group flex h-[30px] items-center gap-1 pr-2 hover:bg-panel2/70"
              style={{ paddingLeft: 8 + depth * 14 }}
            >
              <button
                onClick={() => {
                  setExpanded((previous) => {
                    const next = new Set(previous)
                    if (next.has(entry.path)) next.delete(entry.path)
                    else next.add(entry.path)
                    return next
                  })
                }}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                title={`${entry.path}\n直属 Key ${entry.direct} · 全部 ${entry.count}`}
              >
                {hasChildren ? (
                  open ? (
                    <ChevronDown size={11} className="shrink-0 text-faint" />
                  ) : (
                    <ChevronRight size={11} className="shrink-0 text-faint" />
                  )
                ) : (
                  <span className="w-[11px] shrink-0" />
                )}
                {open ? (
                  <FolderOpen size={12} className="shrink-0 text-amber/85" />
                ) : (
                  <Folder size={12} className="shrink-0 text-amber/60" />
                )}
                <span className="truncate text-[12.5px] text-ink/90">{entry.name}</span>
                <span className="shrink-0 rounded bg-line/40 px-1 text-[11.5px] tabular-nums text-faint">
                  {formatInt(entry.count)}
                </span>
                {state?.loading ? <Loader2 size={9} className="animate-spin text-faint" /> : null}
              </button>
              <Tip label={`只查看 ${entry.path}:*`}>
                <button
                  onClick={() => onFilter(entry.path)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint opacity-0 transition hover:bg-elevated hover:text-ink group-hover:opacity-100"
                >
                  <Search size={10} />
                </button>
              </Tip>
            </div>
          )
        }

        if (row.kind === 'key') {
          const { key, depth } = row
          const active = key.key === activeKey
          const separator = key.key.lastIndexOf(':')
          const prefix = separator > 0 ? key.key.slice(0, separator + 1) : ''
          const name = key.key.slice(separator + 1)
          return (
            <div
              key={`key:${key.key}`}
              className={cn(
                'group relative flex h-[30px] items-center gap-1.5 pr-2 transition-colors',
                active ? 'bg-accent/10' : 'hover:bg-panel2/70',
              )}
              style={{ paddingLeft: 8 + depth * 14 }}
            >
              {active ? (
                <span className="absolute inset-y-1.5 left-0 w-[2px] rounded-r bg-accent" />
              ) : null}
              <span className="w-[11px] shrink-0" />
              <TypeGlyph type={key.keyType} size={15} iconSize={9} />
              <button
                onClick={() => onSelectKey(key.key)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                title={key.key}
              >
                <span
                  className={cn(
                    'truncate mono text-[12.5px]',
                    active ? 'text-ink' : 'text-muted group-hover:text-ink',
                  )}
                >
                  {prefix ? <span className="text-faint/65">{prefix}</span> : null}
                  <span>{name}</span>
                </span>
                <span
                  className={cn(
                    'ml-auto shrink-0 text-[11.5px] tabular-nums',
                    key.ttl >= 0 && key.ttl < 300
                      ? 'text-amber'
                      : key.ttl < 0
                        ? 'text-faint'
                        : 'text-muted',
                  )}
                >
                  {key.ttl === -1 ? '永久' : formatTtl(key.ttl)}
                </span>
              </button>
            </div>
          )
        }

        if (row.kind === 'status') {
          const { depth, status, prefix, message } = row
          return (
            <div
              key={`status:${prefix}:${status}:${depth}`}
              className="flex h-[28px] items-center gap-1.5 pr-2 text-[11.5px] text-faint"
              style={{ paddingLeft: 8 + depth * 14 + 11 }}
            >
              {status === 'loading' ? (
                <>
                  <Spinner size={9} />
                  正在加载该层 Key…
                </>
              ) : status === 'more' ? (
                <button
                  onClick={() => void loadPrefix(prefix, 'more')}
                  className="rounded px-1 py-[1px] text-muted transition hover:bg-elevated hover:text-ink"
                >
                  加载更多 Key（{prefixes[prefix]?.keys.length ?? 0}/
                  {nodeMap.get(prefix)?.entry.direct ?? 0}）
                </button>
              ) : status === 'error' ? (
                <button
                  onClick={() => void loadPrefix(prefix, 'more')}
                  className="text-red"
                  title={message}
                >
                  加载失败，点击重试
                </button>
              ) : (
                <span>此层没有直属 Key</span>
              )}
            </div>
          )
        }
        return null
      })}

      {rows.length === 0 ? (
        <EmptyState
          icon={Layers}
          compact
          title="没有可聚合的命名空间"
          description={
            data.rootKeys > 0
              ? `当前 DB 只有 ${formatInt(data.rootKeys)} 个根级 Key，没有冒号分隔的命名空间。`
              : '当前筛选条件下没有匹配的 Key。'
          }
        />
      ) : null}

      <div className="mx-3 my-2 flex items-start gap-1.5 rounded-[6px] border border-line/60 bg-panel/40 px-2 py-1.5 text-[11.5px] leading-relaxed text-faint">
        <Search size={9} className="mt-[2px] shrink-0" />
        文件夹只负责展开层级；展开后直接显示该层 Key。点击 Key 在右侧查看/编辑/删除、修改 TTL。
      </div>
    </div>
  )
}
