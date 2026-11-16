import {
  ArrowRight,
  Database,
  LayoutDashboard,
  Lock,
  Plus,
  Pencil,
  Radio,
  RefreshCw,
  Server,
  TerminalSquare,
  Timer,
  WifiOff,
} from 'lucide-react'
import { useActiveConnection, useAppStore, TAB_LABELS } from '../lib/store'
import type { ConnectionView, WorkspaceTab } from '../lib/types'
import { cn, envMeta, timeAgo } from '../lib/utils'
import { LogoMark } from './Logo'
import { DatabasePicker } from './DatabasePicker'
import { Badge, Button, IconButton, Spinner, Tip } from './ui'
import { OverviewView } from '../views/Overview'
import { KeysView } from '../views/Keys'
import { ConsoleView } from '../views/Console'
import { SlowLogView } from '../views/SlowLog'
import { PubSubView } from '../views/PubSub'
import { InfoView } from '../views/Info'

const TABS: { key: WorkspaceTab; icon: typeof LayoutDashboard }[] = [
  { key: 'overview', icon: LayoutDashboard },
  { key: 'keys', icon: Database },
  { key: 'console', icon: TerminalSquare },
  { key: 'slowlog', icon: Timer },
  { key: 'pubsub', icon: Radio },
  { key: 'info', icon: Server },
]

export function Workspace() {
  const conn = useActiveConnection()
  const tab = useAppStore((s) => s.tab)
  const setTab = useAppStore((s) => s.setTab)
  const connectingId = useAppStore((s) => s.connectingId)

  if (!conn) return <Welcome />

  if (!conn.connected) {
    return (
      <main className="relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-app">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-[0.15]" />
        <div className="relative flex flex-col items-center gap-4 text-center">
          {connectingId === conn.id ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-line bg-panel">
                <Spinner size={20} className="text-accent" />
              </div>
              <div>
                <p className="text-[15px] font-medium text-ink">正在连接 {conn.name}</p>
                <p className="mt-1 mono text-[11px] text-faint">
                  {conn.host}:{conn.port}
                  {conn.ssh ? ' · 通过 SSH 隧道' : ''}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-line bg-panel text-faint">
                <WifiOff size={20} />
              </div>
              <div>
                <p className="text-[15px] font-medium text-ink">连接已断开</p>
                <p className="mt-1 text-xs text-faint">重新连接后即可浏览键空间与执行命令。</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  icon={RefreshCw}
                  onClick={() => void useAppStore.getState().selectConnection(conn.id)}
                >
                  重新连接
                </Button>
                <Button variant="secondary" onClick={() => useAppStore.getState().openModal(conn.id)}>
                  编辑连接
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-app">
      <ConnectionHeader conn={conn} />
      <div className="flex h-[38px] shrink-0 items-end gap-0.5 border-b border-line/70 px-3">
        {TABS.map((item) => {
          const Icon = item.icon
          const active = tab === item.key
          return (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                'relative flex h-[34px] items-center gap-1.5 rounded-t-[7px] px-2.5 text-[11.5px] font-medium transition',
                active ? 'text-ink' : 'text-muted hover:bg-panel2/50 hover:text-ink',
              )}
            >
              <Icon size={12} className={active ? 'text-accent' : 'text-faint'} strokeWidth={1.9} />
              {TAB_LABELS[item.key]}
              {active ? <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent" /> : null}
            </button>
          )
        })}
        <span className="ml-auto hidden items-center gap-1 pb-2 text-[9px] text-faint lg:flex">
          <span className="kbd">⌘1</span>
          <span className="text-faint/60">–</span>
          <span className="kbd">⌘6</span>
        </span>
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'overview' ? <OverviewView /> : null}
        {tab === 'keys' ? <KeysView /> : null}
        {tab === 'console' ? <ConsoleView /> : null}
        {tab === 'slowlog' ? <SlowLogView /> : null}
        {tab === 'pubsub' ? <PubSubView /> : null}
        {tab === 'info' ? <InfoView /> : null}
      </div>
    </main>
  )
}

function ConnectionHeader({ conn }: { conn: ConnectionView }) {
  const openModal = useAppStore((s) => s.openModal)
  const disconnect = useAppStore((s) => s.disconnect)
  const meta = envMeta(conn.env)

  return (
    <div className="flex h-[56px] shrink-0 items-center gap-3 border-b border-line/70 px-4">
      <div
        className="relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] text-[13px] font-semibold"
        style={{ background: `${conn.color}18`, color: conn.color }}
      >
        {conn.name.slice(0, 1)}
        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-app bg-green" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">{conn.name}</h1>
          <span
            className="rounded-[4px] px-1.5 py-[1px] text-[8.5px] font-semibold uppercase tracking-[0.06em]"
            style={{ background: `${meta.color}16`, color: meta.color }}
          >
            {meta.label}
          </span>
          <DatabasePicker conn={conn} />
          {conn.readOnly ? (
            <Badge color="#FBBF24">
              <Lock size={8} /> 只读
            </Badge>
          ) : null}
          <span className="hidden items-center gap-1 text-[9.5px] text-faint xl:flex">
            <span className="h-1 w-1 rounded-full bg-green" /> 已连接
          </span>
        </div>
        <div className="mt-[2px] flex items-center gap-1.5 mono text-[9.5px] text-faint">
          <span className="truncate">
            {conn.host}:{conn.port}
          </span>
          {conn.username ? (
            <>
              <span className="text-faint/50">/</span>
              <span>{conn.username}</span>
            </>
          ) : null}
          {conn.tls ? <span className="text-cyan/70">TLS</span> : null}
          {conn.ssh ? <span className="text-violet/70">SSH</span> : null}
          <span className="text-faint/50">·</span>
          <span>Redis {conn.serverVersion ?? '—'}</span>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Tip label="刷新当前视图 ⌘R">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('rill:refresh'))}
            className="flex h-[26px] items-center gap-1 rounded-[6px] border border-line bg-panel px-2 text-[10px] text-muted transition hover:text-ink"
          >
            <RefreshCw size={10} /> 刷新
          </button>
        </Tip>
        <div className="mx-1 h-4 w-px bg-line" />
        <IconButton icon={Pencil} label="编辑连接" onClick={() => openModal(conn.id)} size={14} />
        <button
          onClick={() => void disconnect(conn.id)}
          className="flex h-[26px] items-center gap-1 rounded-[6px] border border-line bg-panel px-2 text-[10px] text-muted transition hover:border-red/30 hover:bg-red/5 hover:text-red"
        >
          <WifiOff size={10} /> 断开
        </button>
      </div>
    </div>
  )
}

function Welcome() {
  const connections = useAppStore((s) => s.connections)
  const openModal = useAppStore((s) => s.openModal)
  const selectConnection = useAppStore((s) => s.selectConnection)
  const connectingId = useAppStore((s) => s.connectingId)

  return (
    <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-app px-8">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-[0.18]" />
      <div className="pointer-events-none absolute left-1/2 top-[38%] h-[420px] w-[640px] -translate-x-1/2 -translate-y-1/2 glow-accent" />
      <div className="relative w-full max-w-[660px] py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <LogoMark size={44} />
          <div>
            <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-ink">连接你的 Redis</h1>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              轻快、专注，键盘优先。连接信息保存在本地，密码写入 macOS 钥匙串。
            </p>
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-1.5">
          {connections.length ? (
            [...connections].sort((a, b) => b.lastUsedAt - a.lastUsedAt).map((conn) => {
              const meta = envMeta(conn.env)
              return (
                <button
                  key={conn.id}
                  onClick={() => void selectConnection(conn.id)}
                  className="group flex items-center gap-3 rounded-[11px] border border-line/80 bg-panel/60 px-3 py-2.5 text-left transition hover:border-accent/30 hover:bg-panel2"
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-[13px] font-semibold"
                    style={{ background: `${conn.color}18`, color: conn.color }}
                  >
                    {conn.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-ink">{conn.name}</span>
                      <span
                        className="text-[8.5px] font-semibold uppercase tracking-[0.06em]"
                        style={{ color: meta.color }}
                      >
                        {meta.label}
                      </span>
                      {conn.connected ? (
                        <span className="flex items-center gap-1 text-[9px] text-green">
                          <span className="h-1 w-1 rounded-full bg-green" /> 已连接
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 mono text-[10px] text-faint">
                      {conn.host}:{conn.port} · db{conn.db} · {conn.lastUsedAt ? timeAgo(conn.lastUsedAt) : '未使用'}
                    </div>
                  </div>
                  {connectingId === conn.id ? (
                    <Spinner size={14} className="text-accent" />
                  ) : (
                    <ArrowRight size={14} className="text-faint transition group-hover:translate-x-0.5 group-hover:text-accent" />
                  )}
                </button>
              )
            })
          ) : (
            <div className="rounded-[12px] border border-dashed border-line bg-panel/40 px-6 py-8 text-center">
              <p className="text-[13px] font-medium text-ink">还没有保存连接</p>
              <p className="mt-1 text-[11px] text-faint">添加第一个 Redis 实例，支持 TLS、SSH 隧道与只读保护。</p>
              <Button className="mx-auto mt-3" variant="primary" icon={Plus} onClick={() => openModal(null)}>
                新建连接
              </Button>
            </div>
          )}
          {connections.length ? (
            <button
              onClick={() => openModal(null)}
              className="mt-1 flex h-[38px] items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-line text-[11px] text-muted transition hover:border-accent/40 hover:bg-accent/5 hover:text-ink"
            >
              <Plus size={12} className="text-accent" /> 新建连接
            </button>
          ) : null}
        </div>

        <div className="mt-8 flex items-center justify-center gap-5 text-[9.5px] text-faint">
          <span className="flex items-center gap-1">
            <span className="kbd">⌘K</span> 命令面板
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">⌘N</span> 新建连接
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">⌘B</span> 收起侧栏
          </span>
        </div>
      </div>
    </main>
  )
}
