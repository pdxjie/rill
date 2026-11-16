import { create } from 'zustand'
import { toast } from 'sonner'
import { api, appParams, errorMessage, isMock } from './api'
import { formatInt } from './utils'
import type { ConnectionConfig, ConnectionView, WorkspaceTab } from './types'

const TABS: WorkspaceTab[] = ['overview', 'keys', 'console', 'slowlog', 'pubsub', 'info']

function initialTab(): WorkspaceTab {
  const view = appParams.get('view') as WorkspaceTab | null
  return view && TABS.includes(view) ? view : 'overview'
}

function initialTheme(): 'dark' | 'light' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

interface ConnectionModalState {
  open: boolean
  editId: string | null
}

interface AppStore {
  connections: ConnectionView[]
  loading: boolean
  initialized: boolean
  activeId: string | null
  tab: WorkspaceTab
  activeKey: string | null
  theme: 'dark' | 'light'
  connectingId: string | null
  modal: ConnectionModalState
  paletteOpen: boolean
  sidebarCollapsed: boolean
  isMockMode: boolean

  init: () => Promise<void>
  refresh: () => Promise<void>
  selectConnection: (id: string) => Promise<void>
  disconnect: (id: string) => Promise<void>
  switchDb: (id: string, db: number) => Promise<void>
  setTab: (tab: WorkspaceTab) => void
  setActiveKey: (key: string | null) => void
  toggleTheme: () => void
  openModal: (editId?: string | null) => void
  closeModal: () => void
  openPalette: () => void
  closePalette: () => void
  toggleSidebar: () => void
  afterConnectionSaved: (cfg: ConnectionConfig) => Promise<void>
  removeConnection: (id: string) => Promise<void>
}

let bootstrapping = false

export const useAppStore = create<AppStore>((set, get) => ({
  connections: [],
  loading: true,
  initialized: false,
  activeId: null,
  tab: initialTab(),
  activeKey: appParams.get('key') || null,
  theme: initialTheme(),
  connectingId: null,
  modal: { open: appParams.get('modal') === 'connection', editId: null },
  paletteOpen: appParams.get('palette') === '1',
  sidebarCollapsed: false,
  isMockMode: isMock,

  init: async () => {
    if (bootstrapping || get().initialized) return
    bootstrapping = true
    try {
      await get().refresh()
      const connections = get().connections
      if (!connections.length) {
        set({ initialized: true, loading: false })
        return
      }
      const requested = appParams.get('conn')
      const preferred =
        connections.find((c) => c.id === requested) ??
        [...connections].sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0] ??
        connections[0]
      if (preferred) {
        await get().selectConnection(preferred.id)
      }
    } finally {
      bootstrapping = false
      set({ initialized: true, loading: false })
    }
  },

  refresh: async () => {
    try {
      const connections = await api.listConnections()
      const activeId = get().activeId
      set({
        connections,
        activeId: activeId && connections.some((c) => c.id === activeId) ? activeId : null,
      })
    } catch (error) {
      toast.error('读取连接列表失败', { description: errorMessage(error) })
    }
  },

  selectConnection: async (id) => {
    const conn = get().connections.find((c) => c.id === id)
    if (!conn) return
    const previousId = get().activeId
    const switching = previousId !== null && previousId !== id
    if (conn.connected) {
      set({ activeId: id, activeKey: switching ? null : get().activeKey })
      return
    }
    set({ connectingId: id, activeId: id, activeKey: switching ? null : get().activeKey })
    try {
      const result = await api.connect(id)
      await get().refresh()
      set({ connectingId: null, activeId: id })
      toast.success(`已连接 ${conn.name}`, {
        description: `Redis ${result.version} · ${result.latencyMs.toFixed(1)} ms · ${conn.host}:${conn.port}`,
        duration: 2600,
      })
    } catch (error) {
      set({ connectingId: null })
      toast.error('连接失败', { description: errorMessage(error), duration: 6000 })
      await get().refresh()
    }
  },

  disconnect: async (id) => {
    try {
      await api.disconnect(id)
      await get().refresh()
      if (get().activeId === id) {
        set({ activeId: null, activeKey: null })
      }
      toast.success('已断开连接')
    } catch (error) {
      toast.error('断开失败', { description: errorMessage(error) })
    }
  },

  switchDb: async (id, db) => {
    try {
      const result = await api.switchDb(id, db)
      set((state) => ({
        connections: state.connections.map((conn) =>
          conn.id === id ? { ...conn, db: result.db, lastUsedAt: Date.now() } : conn,
        ),
        activeKey: state.activeId === id ? null : state.activeKey,
      }))
      if (get().tab !== 'keys') {
        window.dispatchEvent(new CustomEvent('rill:refresh'))
      }
      toast.success(`已切换到 db${result.db}`, {
        description: `${formatInt(result.keys)} 个 Key`,
      })
    } catch (error) {
      toast.error('切换数据库失败', { description: errorMessage(error) })
    }
  },

  setTab: (tab) => set({ tab }),
  setActiveKey: (key) => set({ activeKey: key }),

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    document.documentElement.style.background = next === 'dark' ? '#08090B' : '#F4F2ED'
    localStorage.setItem('rill.theme', next)
    set({ theme: next })
  },

  openModal: (editId = null) => set({ modal: { open: true, editId } }),
  closeModal: () => set({ modal: { open: false, editId: null } }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),

  afterConnectionSaved: async (cfg) => {
    await get().refresh()
    set({ modal: { open: false, editId: null } })
    await get().selectConnection(cfg.id)
  },

  removeConnection: async (id) => {
    try {
      await api.deleteConnection(id)
      await get().refresh()
      if (get().activeId === id) {
        set({ activeId: null, activeKey: null })
      }
      set({ modal: { open: false, editId: null } })
      toast.success('连接已删除')
    } catch (error) {
      toast.error('删除失败', { description: errorMessage(error) })
    }
  },
}))

export function useActiveConnection(): ConnectionView | null {
  return useAppStore((state) => state.connections.find((c) => c.id === state.activeId) ?? null)
}

export const TAB_LABELS: Record<WorkspaceTab, string> = {
  overview: '概览',
  keys: '键空间',
  console: '控制台',
  slowlog: '慢日志',
  pubsub: '发布订阅',
  info: '服务器',
}
