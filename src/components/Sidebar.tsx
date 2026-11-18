import { useMemo, useState } from 'react'
import {
  Copy,
  Ellipsis,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plug,
  Plus,
  Trash2,
  Unplug,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '../lib/store'
import type { ConnectionView } from '../lib/types'
import { cn, copyText, envMeta, timeAgo } from '../lib/utils'
import { ContextMenu, type MenuItem } from './Menu'
import { ConfirmDialog, IconButton, Tip } from './ui'

export function Sidebar() {
  const connections = useAppStore((s) => s.connections)
  const activeId = useAppStore((s) => s.activeId)
  const connectingId = useAppStore((s) => s.connectingId)
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const selectConnection = useAppStore((s) => s.selectConnection)
  const disconnect = useAppStore((s) => s.disconnect)
  const openModal = useAppStore((s) => s.openModal)
  const removeConnection = useAppStore((s) => s.removeConnection)
  const isMockMode = useAppStore((s) => s.isMockMode)

  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ConnectionView | null>(null)

  const sorted = useMemo(() => {
    return [...connections].sort((a, b) => {
      if (a.id === activeId) return -1
      if (b.id === activeId) return 1
      if (a.connected !== b.connected) return a.connected ? -1 : 1
      return b.lastUsedAt - a.lastUsedAt
    })
  }, [connections, activeId])

  const connectedCount = connections.filter((c) => c.connected).length
  const menuConnection = menu ? connections.find((c) => c.id === menu.id) : null

  const menuItems: MenuItem[] = menuConnection
    ? [
        {
          label: menuConnection.connected ? '重新选择' : '连接',
          icon: Plug,
          onClick: () => void selectConnection(menuConnection.id),
        },
        {
          label: '编辑连接',
          icon: Pencil,
          onClick: () => openModal(menuConnection.id),
        },
        {
          label: '复制地址',
          icon: Copy,
          onClick: async () => {
            if (await copyText(`${menuConnection.host}:${menuConnection.port}`)) toast.success('地址已复制')
          },
        },
        {
          label: '断开连接',
          icon: Unplug,
          separator: true,
          disabled: !menuConnection.connected,
          onClick: () => void disconnect(menuConnection.id),
        },
        {
          label: '删除连接',
          icon: Trash2,
          danger: true,
          onClick: () => setDeleteTarget(menuConnection),
        },
      ]
    : []

  return (
    <aside
      className={cn(
        'relative z-40 flex shrink-0 flex-col border-r border-line/70 bg-sidebar transition-[width] duration-200',
        collapsed ? 'w-[64px]' : 'w-[246px]',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-1.5 px-3 pb-2 pt-3',
          collapsed ? 'justify-center px-0' : 'justify-between',
        )}
      >
        {collapsed ? (
          <IconButton icon={PanelLeftOpen} label="展开侧栏 ⌘B" onClick={toggleSidebar} />
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-faint">连接</span>
              <span className="rounded-[4px] bg-panel px-1 text-[11.5px] tabular-nums text-muted">
                {connections.length}
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              <IconButton icon={Plus} label="新建连接 ⌘N" onClick={() => openModal(null)} />
              <IconButton icon={PanelLeftClose} label="收起侧栏 ⌘B" onClick={toggleSidebar} />
            </div>
          </>
        )}
      </div>

      <div className={cn('scroll-area min-h-0 flex-1 pb-2', collapsed ? 'px-2' : 'px-2')}>
        {collapsed
          ? sorted.map((conn) => {
              const meta = envMeta(conn.env)
              const active = conn.id === activeId
              return (
                <Tip key={conn.id} label={`${conn.name} · ${conn.host}:${conn.port}`} side="right" className="mb-1.5 flex w-full">
                  <button
                    onClick={() => void selectConnection(conn.id)}
                    className={cn(
                      'relative flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border text-[13px] font-semibold transition',
                      active
                        ? 'border-accent/40 bg-elevated text-ink'
                        : 'border-transparent bg-panel/60 text-muted hover:bg-panel2',
                    )}
                    style={{ color: active ? meta.color : undefined }}
                  >
                    {conn.name.slice(0, 1)}
                    <span
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-sidebar',
                        connectingId === conn.id
                          ? 'animate-pulse bg-amber'
                          : conn.connected
                            ? 'bg-green'
                            : 'bg-linestrong',
                      )}
                    />
                  </button>
                </Tip>
              )
            })
          : sorted.map((conn) => {
              const meta = envMeta(conn.env)
              const active = conn.id === activeId
              const connecting = connectingId === conn.id
              return (
                <div
                  key={conn.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => void selectConnection(conn.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void selectConnection(conn.id)
                  }}
                  className={cn(
                    'group relative mb-1 flex cursor-default items-center gap-2.5 rounded-[9px] px-2 py-[7px] transition',
                    active
                      ? 'bg-elevated shadow-[0_1px_0_rgba(255,255,255,.03)_inset]'
                      : 'hover:bg-panel2/60',
                  )}
                >
                  {active ? (
                    <span
                      className="absolute left-0 top-2 h-[22px] w-[2px] rounded-r"
                      style={{ background: meta.color }}
                    />
                  ) : null}
                  <div
                    className="relative flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-[13px] font-semibold"
                    style={{ background: `${conn.color}18`, color: conn.color }}
                  >
                    {conn.name.slice(0, 1)}
                    <span
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 h-[7px] w-[7px] rounded-full border-2 border-sidebar',
                        connecting
                          ? 'animate-pulse bg-amber'
                          : conn.connected
                            ? 'bg-green'
                            : 'bg-linestrong',
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className={cn('truncate text-[13px] font-medium', active ? 'text-ink' : 'text-muted group-hover:text-ink')}>
                        {conn.name}
                      </span>
                      <span
                        className="shrink-0 rounded-[3px] px-1 text-[11.5px] font-semibold uppercase tracking-[0.08em]"
                        style={{ background: `${meta.color}14`, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-[1px] flex items-center gap-1 truncate mono text-[11.5px] text-faint">
                      <span className="truncate">
                        {conn.host}:{conn.port}
                      </span>
                      <span className="text-faint/50">·</span>
                      <span>db{conn.db}</span>
                      {conn.ssh ? <span className="text-violet/80">· ssh</span> : null}
                      {conn.tls ? <span className="text-cyan/80">· tls</span> : null}
                    </div>
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      const rect = event.currentTarget.getBoundingClientRect()
                      setMenu({ id: conn.id, x: rect.right - 4, y: rect.bottom + 4 })
                    }}
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint transition hover:bg-panel2 hover:text-ink',
                      active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    )}
                  >
                    <Ellipsis size={12} />
                  </button>
                </div>
              )
            })}

        {!connections.length ? (
          <div className="px-3 py-8 text-center text-[12px] leading-relaxed text-faint">
            还没有连接
            <br />
            点击下方按钮添加
          </div>
        ) : null}
      </div>

      <div className={cn('border-t border-line/70 p-2', collapsed && 'flex flex-col items-center gap-1')}>
        {collapsed ? (
          <>
            <IconButton icon={Plus} label="新建连接" onClick={() => openModal(null)} />
            <Tip label={`${connectedCount}/${connections.length} 已连接`} side="right">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-green" />
            </Tip>
          </>
        ) : (
          <>
            <button
              onClick={() => openModal(null)}
              className="flex h-[32px] w-full items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-line text-[12.5px] font-medium text-muted transition hover:border-accent/40 hover:bg-accent/5 hover:text-ink"
            >
              <Plus size={12} className="text-accent" />
              新建连接
            </button>
            <div className="mt-2 flex items-center justify-between px-1 text-[11.5px] text-faint">
              <span className="flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-green" />
                {connectedCount} 已连接 · {connections.length} 个
              </span>
              <span className="truncate pl-2 text-right">
                {isMockMode ? '演示数据' : '凭据存于钥匙串'}
              </span>
            </div>
          </>
        )}
      </div>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除这个连接？"
        description={
          <span>
            连接 <span className="text-ink">{deleteTarget?.name}</span> 的配置和钥匙串密码将被移除，不会影响
            Redis 服务器上的数据。
          </span>
        }
        confirmLabel="删除连接"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void removeConnection(deleteTarget.id)
          setDeleteTarget(null)
        }}
      />
    </aside>
  )
}

export function connectionSubtitle(conn: ConnectionView) {
  const last = conn.lastUsedAt ? `上次使用 ${timeAgo(conn.lastUsedAt)}` : '尚未连接'
  return last
}
