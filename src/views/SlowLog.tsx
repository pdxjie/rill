import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownWideNarrow,
  ChevronDown,
  Copy,
  Gauge,
  RefreshCw,
  Search,
  Timer,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '../lib/api'
import { useActiveConnection } from '../lib/store'
import type { SlowLogEntry } from '../lib/types'
import {
  cn,
  copyText,
  formatDateTime,
  formatDurationUs,
  formatInt,
  timeAgoSeconds,
  truncate,
} from '../lib/utils'
import { Button, ConfirmDialog, EmptyState, IconButton, Skeleton } from '../components/ui'

export function SlowLogView() {
  const conn = useActiveConnection()
  const [entries, setEntries] = useState<SlowLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [count, setCount] = useState(128)
  const [query, setQuery] = useState('')
  const [sortByDuration, setSortByDuration] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  const load = useCallback(async () => {
    if (!conn) return
    setLoading(true)
    try {
      const data = await api.slowlog(conn.id, count)
      setEntries(data)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [conn, count])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const handler = () => void load()
    window.addEventListener('rill:refresh', handler)
    return () => window.removeEventListener('rill:refresh', handler)
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = entries.filter(
      (entry) =>
        !q ||
        entry.args.join(' ').toLowerCase().includes(q) ||
        entry.client.toLowerCase().includes(q) ||
        entry.clientName.toLowerCase().includes(q),
    )
    return sortByDuration ? [...list].sort((a, b) => b.durationUs - a.durationUs) : list
  }, [entries, query, sortByDuration])

  const slowest = entries.reduce((max, entry) => Math.max(max, entry.durationUs), 0)
  const average = entries.length
    ? Math.round(entries.reduce((sum, entry) => sum + entry.durationUs, 0) / entries.length)
    : 0
  const maxDuration = Math.max(slowest, 1)

  if (!conn) return null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line/70 px-4 py-2.5">
        <Timer size={14} className="text-amber" />
        <h1 className="text-sm font-semibold text-ink">慢日志</h1>
        <span className="text-[12px] text-faint">SLOWLOG GET · 服务端阈值</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="筛选命令 / 客户端"
              className="h-[26px] w-[180px] rounded-[6px] border border-line bg-panel pl-6 pr-2 text-[12px] outline-none placeholder:text-faint focus:border-accent/50"
            />
          </div>
          <div className="relative">
            <select
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className="h-[26px] appearance-none rounded-[6px] border border-line bg-panel pl-2 pr-5 text-[12px] text-muted outline-none"
            >
              <option value={64}>最近 64 条</option>
              <option value={128}>最近 128 条</option>
              <option value={256}>最近 256 条</option>
              <option value={512}>最近 512 条</option>
            </select>
            <ChevronDown size={10} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-faint" />
          </div>
          <IconButton
            icon={ArrowDownWideNarrow}
            label={sortByDuration ? '按耗时排序' : '按时间排序'}
            active={sortByDuration}
            onClick={() => setSortByDuration((v) => !v)}
          />
          <IconButton icon={RefreshCw} label="刷新" onClick={() => void load()} />
          <IconButton
            icon={Trash2}
            label="清空慢日志"
            className="hover:bg-red/10 hover:text-red"
            disabled={conn.readOnly}
            onClick={() => setResetOpen(true)}
          />
        </div>
      </div>

      <div className="flex items-center gap-5 border-b border-line/60 bg-panel/30 px-4 py-2 text-[12px] text-faint">
        <span>
          条数 <span className="ml-1 tabular-nums text-ink">{formatInt(entries.length)}</span>
        </span>
        <span>
          最慢 <span className="ml-1 tabular-nums text-red">{formatDurationUs(slowest)}</span>
        </span>
        <span>
          平均 <span className="ml-1 tabular-nums text-muted">{formatDurationUs(average)}</span>
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Gauge size={10} />
          仅统计已记录的命令，阈值由 slowlog-log-slower-than 控制
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-[52px] rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={Timer}
              title="无法读取慢日志"
              description={error}
              action={
                <Button size="sm" icon={RefreshCw} onClick={() => void load()}>
                  重试
                </Button>
              }
            />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={Timer}
              title="暂无慢查询"
              description="当前没有超过配置阈值的命令。可以用 CONFIG SET slowlog-log-slower-than 调整阈值。"
            />
          </div>
        ) : (
          <div>
            <div className="sticky top-0 z-[1] grid grid-cols-[64px_100px_160px_1fr_170px] gap-3 border-b border-line/70 bg-panel2/95 px-4 py-2 text-[11.5px] font-medium uppercase tracking-wider text-faint backdrop-blur">
              <span>ID</span>
              <span>时间</span>
              <span>耗时</span>
              <span>命令</span>
              <span className="text-right">客户端</span>
            </div>
            {filtered.map((entry) => {
              const ratio = entry.durationUs / maxDuration
              const tone =
                entry.durationUs > 20_000 ? 'red' : entry.durationUs > 5_000 ? 'amber' : 'green'
              const isOpen = expanded === entry.id
              return (
                <div key={entry.id} className="border-b border-line/50">
                  <button
                    onClick={() => setExpanded(isOpen ? null : entry.id)}
                    className={cn(
                      'grid w-full grid-cols-[64px_100px_160px_1fr_170px] items-center gap-3 px-4 py-2 text-left transition hover:bg-elevated/40',
                      isOpen && 'bg-elevated/30',
                    )}
                  >
                    <span className="mono text-[12px] tabular-nums text-faint">#{entry.id}</span>
                    <span className="text-[12px] text-muted" title={formatDateTime(entry.timestamp * 1000)}>
                      {timeAgoSeconds(entry.timestamp)}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-[4px] w-[86px] overflow-hidden rounded-full bg-line/60">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            tone === 'red' ? 'bg-red' : tone === 'amber' ? 'bg-amber' : 'bg-green',
                          )}
                          style={{ width: `${Math.max(4, ratio * 100)}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          'mono text-[12px] tabular-nums',
                          tone === 'red' ? 'text-red' : tone === 'amber' ? 'text-amber' : 'text-green',
                        )}
                      >
                        {formatDurationUs(entry.durationUs)}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="rounded bg-accent/10 px-1.5 py-[1px] mono text-[12px] font-medium text-accent">
                        {entry.args[0]?.toUpperCase() ?? '—'}
                      </span>
                      <span className="min-w-0 truncate mono text-[12px] text-muted">
                        {truncate(entry.args.slice(1).join(' '), 80)}
                      </span>
                    </div>
                    <span className="truncate text-right mono text-[12px] text-faint" title={entry.client}>
                      {entry.clientName ? `${entry.clientName} · ` : ''}
                      {entry.client}
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="mx-4 mb-2 rounded-[8px] border border-line/70 bg-app/50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[12px] font-medium uppercase tracking-wider text-faint">
                          完整命令 · {entry.args.length} 参数
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={async () => {
                              const command = entry.args.join(' ')
                              if (await copyText(command)) toast.success('已复制命令')
                            }}
                            className="flex items-center gap-1 rounded px-1.5 py-[2px] text-[11.5px] text-muted transition hover:bg-elevated hover:text-ink"
                          >
                            <Copy size={9} /> 复制
                          </button>
                          <span className="text-[11.5px] text-faint">
                            {formatDateTime(entry.timestamp * 1000)} · {entry.durationUs} µs
                          </span>
                        </div>
                      </div>
                      <pre className="mono whitespace-pre-wrap break-all text-[12.5px] leading-[1.7] text-ink">
                        {entry.args.map((arg, index) => (
                          <span key={index}>
                            {index > 0 ? ' ' : ''}
                            <span
                              className={
                                index === 0
                                  ? 'font-semibold text-accent'
                                  : /^\d+$/.test(arg)
                                    ? 'text-amber'
                                    : 'text-ink'
                              }
                            >
                              {arg.includes(' ') ? `"${arg}"` : arg}
                            </span>
                          </span>
                        ))}
                      </pre>
                    </div>
                  ) : null}
                </div>
              )
            })}
            {filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-[12.5px] text-faint">没有匹配“{query}”的记录</p>
            ) : null}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={resetOpen}
        title="清空慢日志？"
        description="将执行 SLOWLOG RESET，只影响慢日志记录，不会影响数据。"
        confirmLabel="清空"
        danger
        onCancel={() => setResetOpen(false)}
        onConfirm={async () => {
          try {
            await api.slowlogReset(conn.id)
            setResetOpen(false)
            toast.success('慢日志已清空')
            await load()
          } catch (err) {
            toast.error('清空失败', { description: errorMessage(err) })
          }
        }}
      />
    </div>
  )
}
