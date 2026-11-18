import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Check,
  Copy,
  Database,
  HardDrive,
  RefreshCw,
  Search,
  Server,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '../lib/api'
import { useActiveConnection } from '../lib/store'
import type { ClientRow, InfoSection, Overview } from '../lib/types'
import {
  cn,
  copyText,
  formatBytes,
  formatInt,
  formatPercent,
  formatUptime,
} from '../lib/utils'
import { Button, EmptyState, IconButton, Skeleton } from '../components/ui'

export function InfoView() {
  const conn = useActiveConnection()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [sections, setSections] = useState<InfoSection[]>([])
  const [active, setActive] = useState('Server')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'info' | 'clients'>('info')
  const [clients, setClients] = useState<ClientRow[] | null>(null)
  const [clientsLoading, setClientsLoading] = useState(false)

  const load = useCallback(async () => {
    if (!conn) return
    setLoading(true)
    try {
      const data = await api.overview(conn.id)
      setOverview(data)
      setSections(data.sections)
      setError(null)
      if (!data.sections.some((s) => s.name === active)) {
        setActive(data.sections[0]?.name ?? 'Server')
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [conn, active])

  useEffect(() => {
    void load()
  }, [conn?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => void load()
    window.addEventListener('rill:refresh', handler)
    return () => window.removeEventListener('rill:refresh', handler)
  }, [load])

  const loadClients = useCallback(async () => {
    if (!conn) return
    setClientsLoading(true)
    try {
      const data = await api.clients(conn.id)
      setClients(data)
    } catch (err) {
      toast.error('读取客户端列表失败', { description: errorMessage(err) })
    } finally {
      setClientsLoading(false)
    }
  }, [conn])

  useEffect(() => {
    if (view === 'clients' && !clients) void loadClients()
  }, [view, clients, loadClients])

  const section = sections.find((s) => s.name === active)
  const filtered = useMemo(() => {
    if (!section) return []
    const q = query.trim().toLowerCase()
    if (!q) return section.items
    return section.items.filter(
      (item) => item.key.toLowerCase().includes(q) || item.value.toLowerCase().includes(q),
    )
  }, [section, query])

  if (!conn) return null

  return (
    <div className="flex h-full min-w-0">
      <aside className="flex w-[204px] shrink-0 flex-col border-r border-line/70 bg-panel/20">
        <div className="flex h-[40px] items-center gap-1.5 border-b border-line/70 px-3">
          <Server size={12} className="text-accent" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">INFO</span>
          <span className="ml-auto text-[11.5px] text-faint">{sections.length} sections</span>
        </div>
        <div className="scroll-area flex-1 py-1.5">
          {sections.map((item) => (
            <button
              key={item.name}
              onClick={() => {
                setView('info')
                setActive(item.name)
                setQuery('')
              }}
              className={cn(
                'flex h-[30px] w-full items-center gap-2 px-3 text-left text-[12.5px] transition',
                view === 'info' && active === item.name
                  ? 'bg-elevated text-ink'
                  : 'text-muted hover:bg-panel2/60 hover:text-ink',
              )}
            >
              {view === 'info' && active === item.name ? (
                <span className="h-1 w-1 rounded-full bg-accent" />
              ) : (
                <span className="h-1 w-1 rounded-full bg-line" />
              )}
              <span className="flex-1 truncate">{item.name}</span>
              <span className="text-[11.5px] tabular-nums text-faint">{item.items.length}</span>
            </button>
          ))}
          <div className="mx-3 my-1.5 h-px bg-line/70" />
          <button
            onClick={() => setView('clients')}
            className={cn(
              'flex h-[30px] w-full items-center gap-2 px-3 text-left text-[12.5px] transition',
              view === 'clients' ? 'bg-elevated text-ink' : 'text-muted hover:bg-panel2/60 hover:text-ink',
            )}
          >
            <Users size={11} className={view === 'clients' ? 'text-accent' : 'text-faint'} />
            <span className="flex-1">客户端连接</span>
            <span className="text-[11.5px] tabular-nums text-faint">{clients?.length ?? '·'}</span>
          </button>
        </div>
        <div className="border-t border-line/70 p-2">
          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            className="w-full justify-start"
            onClick={() => (view === 'info' ? void load() : void loadClients())}
          >
            刷新数据
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-[44px] items-center gap-2 border-b border-line/70 px-4 py-2">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-ink">
              {view === 'clients' ? '客户端连接' : active}
            </h1>
            <p className="mono text-[11.5px] text-faint">
              {overview
                ? `Redis ${overview.version} · ${formatUptime(overview.uptimeSecs)} · ${formatBytes(overview.usedMemory)}`
                : '读取中…'}
            </p>
          </div>
          {overview ? (
            <div className="ml-3 hidden items-center gap-1.5 lg:flex">
              <span className="chip">{formatPercent(overview.hitRate)} hit</span>
              <span className="chip">{formatInt(overview.connectedClients)} clients</span>
              <span className="chip">{overview.role}</span>
            </div>
          ) : null}
          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative">
              <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="筛选字段"
                className="h-[26px] w-[160px] rounded-[6px] border border-line bg-panel pl-6 pr-2 text-[12px] outline-none placeholder:text-faint focus:border-accent/50"
              />
            </div>
            <CopyAllButton
              text={
                view === 'clients'
                  ? (clients ?? [])
                      .map((c) => `${c.id}\t${c.addr}\t${c.name}\t${c.db}\t${c.cmd}`)
                      .join('\n')
                  : (section?.items ?? []).map((item) => `${item.key}:${item.value}`).join('\n')
              }
            />
            <IconButton icon={RefreshCw} label="刷新" onClick={() => (view === 'info' ? void load() : void loadClients())} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === 'clients' ? (
            <ClientsTable rows={clients} loading={clientsLoading} />
          ) : loading && !sections.length ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-7 rounded-md" />
              ))}
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                icon={AlertCircle}
                title="无法读取服务器信息"
                description={error}
                action={
                  <Button size="sm" icon={RefreshCw} onClick={() => void load()}>
                    重试
                  </Button>
                }
              />
            </div>
          ) : (
            <div>
              {section?.name === 'Keyspace' ? (
                <div className="flex flex-wrap gap-2 px-4 py-3">
                  {section.items.map((item) => (
                    <div key={item.key} className="rounded-[10px] border border-line bg-panel px-3 py-2">
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                        <Database size={10} className="text-accent" /> {item.key}
                      </div>
                      <div className="mt-1 mono text-[12px] text-faint">{item.value}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              <table className="w-full table-fixed border-collapse text-[12.5px]">
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.key} className="group border-b border-line/40 hover:bg-elevated/30">
                      <td className="w-[240px] px-4 py-1.5 align-top mono text-[12px] text-muted">{item.key}</td>
                      <td className="px-3 py-1.5 align-top">
                        <span className="mono whitespace-pre-wrap break-all text-[12px] text-ink">{item.value || '—'}</span>
                      </td>
                      <td className="w-8 px-2 align-middle">
                        <button
                          onClick={async () => {
                            if (await copyText(item.value)) toast.success('已复制')
                          }}
                          className="flex h-5 w-5 items-center justify-center rounded text-faint opacity-0 transition hover:bg-elevated hover:text-ink group-hover:opacity-100"
                        >
                          <Copy size={9} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 ? (
                <p className="py-10 text-center text-[12.5px] text-faint">
                  {query ? `没有匹配“${query}”的字段` : '该 section 没有内容'}
                </p>
              ) : null}
              <div className="flex items-center gap-1.5 px-4 py-3 text-[11.5px] text-faint">
                <HardDrive size={9} /> 数据来自 INFO 命令 · {section?.items.length ?? 0} 个字段 · 只读
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CopyAllButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={copied ? Check : Copy}
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true)
          toast.success('已复制到剪贴板')
          window.setTimeout(() => setCopied(false), 1400)
        }
      }}
    >
      {copied ? '已复制' : '复制'}
    </Button>
  )
}

function ClientsTable({ rows, loading }: { rows: ClientRow[] | null; loading: boolean }) {
  if (loading && !rows) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-7 rounded-md" />
        ))}
      </div>
    )
  }
  if (!rows?.length) {
    return <EmptyState icon={Users} title="没有客户端连接" description="CLIENT LIST 返回为空。" />
  }
  return (
    <div>
      <div className="sticky top-0 z-[1] grid grid-cols-[52px_1fr_110px_70px_60px_44px_120px_78px] gap-2 border-b border-line/70 bg-panel2/95 px-4 py-2 text-[11.5px] font-medium uppercase tracking-wider text-faint backdrop-blur">
        <span>ID</span>
        <span>地址</span>
        <span>名称</span>
        <span>年龄</span>
        <span>空闲</span>
        <span>DB</span>
        <span>最后命令</span>
        <span>用户</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid grid-cols-[52px_1fr_110px_70px_60px_44px_120px_78px] items-center gap-2 border-b border-line/40 px-4 py-1.5 text-[12px] hover:bg-elevated/30"
        >
          <span className="mono tabular-nums text-faint">#{row.id}</span>
          <span className="truncate mono text-ink" title={row.addr}>
            {row.addr}
          </span>
          <span className="truncate text-muted">{row.name || '—'}</span>
          <span className="truncate tabular-nums text-muted" title={`${row.age}s`}>{formatUptime(row.age)}</span>
          <span className="tabular-nums text-muted">{row.idle}s</span>
          <span className="tabular-nums text-faint">{row.db}</span>
          <span className="truncate mono text-[11.5px] text-accent/80">{row.cmd}</span>
          <span className="truncate text-faint">{row.user}</span>
        </div>
      ))}
      <p className="px-4 py-3 text-[11.5px] text-faint">共 {rows.length} 个连接 · CLIENT LIST</p>
    </div>
  )
}
