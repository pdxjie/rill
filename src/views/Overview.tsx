import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Clock,
  Database,
  Gauge,
  HardDrive,
  Lock,
  MemoryStick,
  RefreshCw,
  ScanSearch,
  Server,
  Target,
  TerminalSquare,
  Users,
  Zap,
} from 'lucide-react'
import { api, errorMessage, isMock } from '../lib/api'
import { mockHistory } from '../lib/mock'
import { useActiveConnection, useAppStore } from '../lib/store'
import type { AnalysisResult, Overview } from '../lib/types'
import {
  cn,
  formatBytes,
  formatDurationUs,
  formatInt,
  formatNumber,
  formatPercent,
  formatUptime,
  timeAgoSeconds,
  typeMeta,
} from '../lib/utils'
import { AreaChart, BarRow, Ring, Sparkline } from '../components/charts'
import { Button, EmptyState, Modal, ModalHeader, Skeleton } from '../components/ui'

interface Sample {
  ts: number
  ops: number
  memory: number
  clients: number
  hitRate: number
}

export function OverviewView() {
  const conn = useActiveConnection()
  const setTab = useAppStore((s) => s.setTab)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [history, setHistory] = useState<Sample[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const id = conn?.id

  const load = useCallback(
    async (silent = false) => {
      if (!id) return
      if (!silent) setRefreshing(true)
      try {
        const data = await api.overview(id)
        setOverview(data)
        setError(null)
        setHistory((prev) => {
          const next: Sample = {
            ts: data.sampledAt,
            ops: data.opsPerSec,
            memory: data.usedMemory,
            clients: data.connectedClients,
            hitRate: data.hitRate,
          }
          if (!prev.length) {
            return isMock ? [...mockHistory(data).slice(0, -1), next].slice(-60) : [next]
          }
          return [...prev, next].slice(-60)
        })
      } catch (err) {
        setError(errorMessage(err))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [id],
  )

  useEffect(() => {
    setOverview(null)
    setHistory([])
    setLoading(true)
    void load(true)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, 4000)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    const handler = () => void load()
    window.addEventListener('rill:refresh', handler)
    return () => window.removeEventListener('rill:refresh', handler)
  }, [load])

  if (!conn) return null

  if (loading && !overview) {
    return (
      <div className="flex h-full flex-col gap-4 overflow-hidden p-6">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[116px] rounded-[14px]" />
          ))}
        </div>
        <div className="grid grid-cols-[1.9fr_1fr] gap-3">
          <Skeleton className="h-[286px] rounded-[14px]" />
          <Skeleton className="h-[286px] rounded-[14px]" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[190px] rounded-[14px]" />
          ))}
        </div>
      </div>
    )
  }

  if (error && !overview) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={Server}
          title="无法读取服务器信息"
          description={error}
          action={
            <Button icon={RefreshCw} onClick={() => void load()}>
              重试
            </Button>
          }
        />
      </div>
    )
  }

  if (!overview) return null

  const memoryPct = overview.maxMemory ? overview.usedMemory / overview.maxMemory : 0
  const memSpark = history.map((h) => h.memory)
  const opsSpark = history.map((h) => h.ops)
  const clientSpark = history.map((h) => h.clients)
  const maxCommand = Math.max(...overview.topCommands.map((c) => c.calls), 1)
  const maxDb = Math.max(...overview.dbs.map((d) => d.keys), 1)
  const lastUpdated = overview.sampledAt

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex w-full flex-col gap-3.5 px-6 py-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">概览</h1>
              <span className="flex items-center gap-1.5 rounded-full border border-line bg-panel px-2 py-[2px] text-[12px] font-medium text-muted">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green opacity-50" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green" />
                </span>
                实时
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              每 4 秒自动采样 · 上次更新 {timeAgoSeconds(Math.floor(lastUpdated / 1000))}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              icon={RefreshCw}
              loading={refreshing}
              onClick={() => void load()}
            >
              刷新
            </Button>
            <Button size="sm" variant="secondary" icon={ScanSearch} onClick={() => setAnalysisOpen(true)}>
              空间分析
            </Button>
            <Button size="sm" variant="secondary" icon={TerminalSquare} onClick={() => setTab('console')}>
              控制台
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="card group relative overflow-hidden p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.08em] text-faint">
                <MemoryStick size={12} className="text-blue" />
                内存使用
              </span>
              <span className="text-2xs text-faint">{overview.maxMemory ? 'maxmemory 已设置' : '未限制'}</span>
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">
                    {formatBytes(overview.usedMemory)}
                  </span>
                </div>
                <p className="mt-1.5 truncate text-2xs text-faint">
                  峰值 {formatBytes(overview.usedMemoryPeak)} · 碎片率 {overview.memFragmentationRatio.toFixed(2)}
                </p>
              </div>
              <Sparkline data={memSpark} color="#60A5FA" width={76} height={34} />
            </div>
            <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-line/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue/70 to-blue transition-[width] duration-700"
                style={{ width: `${Math.max(2, Math.min(100, memoryPct * 100))}%` }}
              />
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.08em] text-faint">
                <Activity size={12} className="text-accent" />
                每秒操作
              </span>
              <span className="text-2xs text-faint">ops/s</span>
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <div>
                <span className="text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">
                  {formatNumber(overview.opsPerSec)}
                </span>
                <p className="mt-1.5 text-2xs text-faint">
                  累计 {formatNumber(overview.totalCommandsProcessed)} 次命令
                </p>
              </div>
              <Sparkline data={opsSpark} color="#FF6B57" width={76} height={34} />
            </div>
            <div className="mt-3 flex items-center gap-1 text-2xs text-faint">
              <Zap size={10} className="text-accent2" />
              入 {formatBytes(overview.netInputBytes)} · 出 {formatBytes(overview.netOutputBytes)}
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.08em] text-faint">
                <Target size={12} className="text-green" />
                缓存命中率
              </span>
              <span className="text-2xs text-faint">keyspace</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div>
                <span className="text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">
                  {formatPercent(overview.hitRate)}
                </span>
                <p className="mt-1.5 text-2xs text-faint">
                  命中 {formatNumber(overview.keyspaceHits)} · 未命中 {formatNumber(overview.keyspaceMisses)}
                </p>
              </div>
              <Ring value={overview.hitRate} size={50} width={4} color="#4ADE80">
                <span className="text-[11.5px] font-semibold text-green">HIT</span>
              </Ring>
            </div>
            <div className="mt-2.5 flex items-center gap-1 text-2xs text-faint">
              驱逐 {formatInt(overview.evictedKeys)} · 过期 {formatInt(overview.expiredKeys)}
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.08em] text-faint">
                <Users size={12} className="text-violet" />
                客户端连接
              </span>
              {conn.readOnly ? (
                <span className="flex items-center gap-1 text-[11.5px] font-medium uppercase text-amber">
                  <Lock size={9} /> 只读
                </span>
              ) : (
                <span className="text-2xs text-faint">connected</span>
              )}
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <div>
                <span className="text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">
                  {formatInt(overview.connectedClients)}
                </span>
                <p className="mt-1.5 text-2xs text-faint">
                  累计 {formatNumber(overview.totalConnectionsReceived)} 次接入
                </p>
              </div>
              <Sparkline data={clientSpark} color="#A78BFA" width={76} height={34} />
            </div>
            <div className="mt-3 flex items-center gap-1 text-2xs text-faint">
              拒绝 {formatInt(overview.rejectedConnections)} · {overview.maxmemoryPolicy}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[1.85fr_1fr] gap-3">
          <div className="card p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-ink">吞吐量</h2>
                <p className="mt-0.5 text-2xs text-faint">
                  最近 {Math.max(1, Math.round(((history.at(-1)?.ts ?? 0) - (history[0]?.ts ?? 0)) / 60000))} 分钟 ·
                  采样 {history.length} 次
                </p>
              </div>
              <div className="flex items-center gap-3 text-2xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  ops/s
                </span>
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">
                {formatInt(overview.opsPerSec)}
              </span>
              <span className="text-xs text-muted">ops/s 当前</span>
              <span className="ml-auto text-2xs text-faint">
                峰值 {formatNumber(Math.max(...history.map((h) => h.ops), overview.opsPerSec))}
              </span>
            </div>
            <AreaChart
              data={history.map((h) => ({ ts: h.ts, value: h.ops }))}
              height={188}
              color="#FF6B57"
              className="mt-2"
              formatValue={(v) => `${formatInt(v)} ops/s`}
              formatTime={(ts) =>
                new Date(ts).toLocaleTimeString('en-GB', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              }
            />
          </div>

          <div className="card flex flex-col p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-ink">键空间</h2>
                <p className="mt-0.5 text-2xs text-faint">
                  {overview.dbs.length} 个数据库
                  {overview.dbs.length > 4 ? ' · 滚动查看' : ''}
                </p>
              </div>
              <span className="mono text-2xl font-semibold tracking-[-0.03em] tabular-nums text-ink">
                {formatNumber(overview.dbsize)}
              </span>
            </div>
            <div className="scroll-area mt-4 flex max-h-[232px] flex-col gap-3 overflow-y-auto pr-1">
              {overview.dbs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-2xs text-faint">
                  当前实例没有数据
                </div>
              ) : (
                overview.dbs.map((db) => (
                  <div key={db.db} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="mono font-medium text-ink">{db.db}</span>
                      <span className="tabular-nums text-muted">{formatInt(db.keys)} keys</span>
                    </div>
                    <div className="h-[5px] overflow-hidden rounded-full bg-line/50">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent to-accent2 transition-[width] duration-700"
                        style={{ width: `${Math.max(2, (db.keys / maxDb) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11.5px] text-faint">
                      <span>过期 {formatInt(db.expires)}</span>
                      <span>avg ttl {formatDurationUs(db.avgTtl * 1000)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-auto flex items-center justify-between border-t border-line/70 pt-3 text-2xs text-faint">
              <span>总内存 {formatBytes(overview.usedMemory)}</span>
              <button
                className="inline-flex items-center gap-1 text-muted transition hover:text-ink"
                onClick={() => setTab('keys')}
              >
                浏览键 <ArrowUpRight size={11} />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[1.1fr_1fr_0.95fr] gap-3">
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">高频命令</h2>
              <BarChart3 size={13} className="text-faint" />
            </div>
            <p className="mt-0.5 text-2xs text-faint">按累计调用次数排序</p>
            <div className="mt-3.5 flex flex-col gap-2.5">
              {overview.topCommands.length ? (
                overview.topCommands.slice(0, 6).map((cmd) => (
                  <BarRow
                    key={cmd.name}
                    label={cmd.name.toUpperCase()}
                    value={cmd.calls}
                    max={maxCommand}
                    hint={`${formatNumber(cmd.calls)} · ${cmd.usecPerCall.toFixed(2)} µs`}
                    color="rgb(var(--accent) / 0.85)"
                    mono
                  />
                ))
              ) : (
                <p className="py-6 text-center text-2xs text-faint">暂无命令统计</p>
              )}
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">运行时健康</h2>
              <Gauge size={13} className="text-faint" />
            </div>
            <p className="mt-0.5 text-2xs text-faint">依据 INFO 指标自动判断</p>
            <div className="mt-3 flex flex-col divide-y divide-line/60">
              <HealthRow
                label="内存碎片率"
                value={overview.memFragmentationRatio.toFixed(2)}
                status={
                  overview.memFragmentationRatio > 1.5
                    ? 'warn'
                    : overview.memFragmentationRatio > 1.2
                      ? 'ok'
                      : 'good'
                }
                hint={overview.memFragmentationRatio > 1.5 ? '偏高，建议关注内存分配' : '处于健康区间'}
              />
              <HealthRow
                label="内存驱逐"
                value={formatInt(overview.evictedKeys)}
                status={overview.evictedKeys > 0 ? 'warn' : 'good'}
                hint={overview.evictedKeys > 0 ? '已触发 maxmemory 驱逐' : '未发生数据驱逐'}
              />
              <HealthRow
                label="连接拒绝"
                value={formatInt(overview.rejectedConnections)}
                status={overview.rejectedConnections > 0 ? 'bad' : 'good'}
                hint={overview.rejectedConnections > 0 ? '检查 maxclients 与连接池' : '没有连接被拒绝'}
              />
              <HealthRow
                label="慢查询"
                value={formatInt(overview.slowlogLen)}
                status={overview.slowlogLen > 0 ? 'warn' : 'good'}
                hint={overview.slowlogLen > 0 ? '建议检查慢日志中的大 key 操作' : '没有慢查询记录'}
              />
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">服务器</h2>
              <Server size={13} className="text-faint" />
            </div>
            <p className="mt-0.5 text-2xs text-faint">
              Redis {overview.version} · {overview.mode}
            </p>
            <div className="mt-3 flex flex-col gap-2 text-xs">
              <InfoLine icon={Database} label="数据集" value={`${formatNumber(overview.dbsize)} keys`} />
              <InfoLine icon={Clock} label="运行时长" value={formatUptime(overview.uptimeSecs)} />
              <InfoLine icon={Server} label="角色" value={overview.role === 'master' ? `主节点 · ${overview.replication.connectedSlaves} 从节点` : '从节点'} />
              <InfoLine
                icon={HardDrive}
                label="持久化"
                value={`RDB ${timeAgoSeconds(overview.rdbLastSaveTime)}${overview.aofEnabled ? ' · AOF 开启' : ''}`}
              />
              <InfoLine icon={MemoryStick} label="分配器" value={overview.sections.find((s) => s.name === 'Memory')?.items.find((i) => i.key === 'mem_allocator')?.value ?? '—'} />
            </div>
            <button
              className="mt-3 flex w-full items-center justify-between rounded-lg border border-line/80 bg-panel px-2.5 py-1.5 text-2xs text-muted transition hover:border-linestrong hover:text-ink"
              onClick={() => setTab('info')}
            >
              查看全部 INFO
              <ArrowUpRight size={11} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-1 pb-1 text-2xs text-faint">
          <span className="mono">
            {overview.os || 'unknown'} · pid {overview.sections.find((s) => s.name === 'Server')?.items.find((i) => i.key === 'process_id')?.value ?? '—'}
          </span>
          <span>Rill · 本地客户端，凭据保存在 macOS 钥匙串</span>
        </div>
      </div>

      <AnalysisModal
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
        connectionId={id!}
      />
    </div>
  )
}

function HealthRow({
  label,
  value,
  status,
  hint,
}: {
  label: string
  value: string
  status: 'good' | 'ok' | 'warn' | 'bad'
  hint: string
}) {
  const colors = {
    good: 'bg-green',
    ok: 'bg-blue',
    warn: 'bg-amber',
    bad: 'bg-red',
  }
  return (
    <div className="flex items-center gap-2.5 py-2">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', colors[status])} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-ink">{label}</span>
          <span className="mono text-2xs tabular-nums text-muted">{value}</span>
        </div>
        <p className="truncate text-[11.5px] text-faint">{hint}</p>
      </div>
    </div>
  )
}

function InfoLine({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={12} className="shrink-0 text-faint" />
      <span className="w-[52px] shrink-0 text-2xs text-faint">{label}</span>
      <span className="min-w-0 truncate text-2xs text-muted">{value}</span>
    </div>
  )
}

function AnalysisModal({
  open,
  onClose,
  connectionId,
}: {
  open: boolean
  onClose: () => void
  connectionId: string
}) {
  const [data, setData] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requested = useRef(false)

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.analyze(connectionId, 5000)
      setData(result)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [connectionId])

  useEffect(() => {
    if (open && !requested.current) {
      requested.current = true
      void run()
    }
  }, [open, run])

  const maxKey = Math.max(...(data?.topKeys.map((k) => k.bytes) ?? [1]), 1)
  const maxPrefix = Math.max(...(data?.prefixes.map((p) => p.bytes) ?? [1]), 1)

  return (
    <Modal open={open} onClose={onClose} width={760}>
      <ModalHeader
        icon={ScanSearch}
        title="空间分析"
        description="对最多 5,000 个 key 抽样 MEMORY USAGE，定位内存占用与命名空间热点。"
        onClose={onClose}
      />
      <div className="scroll-area max-h-[62vh] px-5 py-4">
        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-52 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : error ? (
          <EmptyState
            icon={ScanSearch}
            compact
            title="分析失败"
            description={error}
            action={
              <Button size="sm" onClick={() => void run()}>
                重试
              </Button>
            }
          />
        ) : data ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-line bg-panel p-3">
                <p className="text-2xs uppercase tracking-wider text-faint">扫描 Key</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatInt(data.scanned)}</p>
              </div>
              <div className="rounded-xl border border-line bg-panel p-3">
                <p className="text-2xs uppercase tracking-wider text-faint">抽样内存</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatBytes(data.totalBytes)}</p>
              </div>
              <div className="rounded-xl border border-line bg-panel p-3">
                <p className="text-2xs uppercase tracking-wider text-faint">平均每 Key</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {formatBytes(data.scanned ? data.totalBytes / data.scanned : 0)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <Database size={12} className="text-accent" /> 最大的 Key
                </h3>
                <div className="flex flex-col gap-2">
                  {data.topKeys.map((key) => {
                    const meta = typeMeta(key.keyType)
                    return (
                      <div key={key.key} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate mono text-[12.5px] text-ink" title={key.key}>
                            {key.key}
                          </span>
                          <span className="shrink-0 text-2xs tabular-nums text-muted">
                            {formatBytes(key.bytes)}
                          </span>
                        </div>
                        <div className="h-[3px] overflow-hidden rounded-full bg-line/50">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(2, (key.bytes / maxKey) * 100)}%`,
                              background: meta.color,
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <HardDrive size={12} className="text-blue" /> 命名空间占用
                </h3>
                <div className="flex flex-col gap-2.5">
                  {data.prefixes.map((prefix) => (
                    <BarRow
                      key={prefix.prefix}
                      label={prefix.prefix}
                      value={prefix.bytes}
                      max={maxPrefix}
                      hint={`${formatBytes(prefix.bytes)} · ${prefix.keys} keys`}
                      color="rgb(var(--blue) / 0.8)"
                      mono
                    />
                  ))}
                </div>
              </div>
            </div>
            <p className="text-[12px] leading-relaxed text-faint">
              提示：MEMORY USAGE 对集合类型使用 3 个样本估算；结果用于发现热点，不等同于精确的 RDB 体积。
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
