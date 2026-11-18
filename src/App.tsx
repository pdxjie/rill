import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { Keyboard, Zap } from 'lucide-react'
import { useAppStore } from './lib/store'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { Workspace } from './components/Workspace'
import { ConnectionModal } from './components/ConnectionModal'
import { CommandPalette } from './components/CommandPalette'
import { LogoMark } from './components/Logo'
import { Modal, ModalHeader } from './components/ui'

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['⌘', 'K'], label: '打开命令面板，搜索连接 / Key / 操作' },
  { keys: ['⌘', 'N'], label: '新建连接' },
  { keys: ['⌘', 'B'], label: '收起或展开侧栏' },
  { keys: ['⌘', '1'], label: '切换到「概览」…「服务器」，1–6 对应标签' },
  { keys: ['⌘', 'R'], label: '刷新当前视图' },
  { keys: ['↑', '↓'], label: '在键空间列表中移动选择' },
  { keys: ['/', ''], label: '聚焦键空间搜索框' },
  { keys: ['⌘', 'S'], label: '保存字符串编辑（编辑态）' },
  { keys: ['↵'], label: '执行控制台命令 / 确认对话框' },
]

export default function App() {
  const init = useAppStore((s) => s.init)
  const initialized = useAppStore((s) => s.initialized)
  const theme = useAppStore((s) => s.theme)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (!meta) return
      const key = event.key.toLowerCase()
      const store = useAppStore.getState()
      if (key === 'k') {
        event.preventDefault()
        if (store.paletteOpen) store.closePalette()
        else store.openPalette()
      } else if (key === 'n') {
        event.preventDefault()
        store.openModal(null)
      } else if (key === 'b') {
        event.preventDefault()
        store.toggleSidebar()
      } else if (key === 'r') {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('rill:refresh'))
      } else if (/^[1-6]$/.test(key)) {
        const tabs = ['overview', 'keys', 'console', 'slowlog', 'pubsub', 'info'] as const
        if (store.activeId) {
          event.preventDefault()
          store.setTab(tabs[Number(key) - 1])
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!initialized) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-app">
        <div className="pointer-events-none absolute h-[300px] w-[420px] glow-accent" />
        <div className="relative animate-pulse">
          <LogoMark size={46} />
        </div>
        <div className="relative flex items-center gap-2 text-[12.5px] text-faint">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
          正在载入连接…
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app">
      <TitleBar onShortcuts={() => setShortcutsOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <Workspace />
      </div>

      <ConnectionModal />
      <CommandPalette />

      <Modal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} width={520}>
        <ModalHeader
          icon={Keyboard}
          title="键盘快捷键"
          description="Rill 为高频操作设计了完整的键盘路径。"
          onClose={() => setShortcutsOpen(false)}
        />
        <div className="flex flex-col gap-1 p-4">
          {SHORTCUTS.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-4 rounded-[6px] px-2 py-1.5 hover:bg-elevated/50"
            >
              <span className="text-[12.5px] text-muted">{item.label}</span>
              <span className="flex shrink-0 items-center gap-1">
                {item.keys.filter(Boolean).map((key) => (
                  <span key={key} className="kbd">
                    {key}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 border-t border-line/70 px-4 py-2.5 text-[11.5px] text-faint">
          <Zap size={9} className="text-accent" /> 提示：⌘K 可以搜索已加载的 Key，并直接跳转。
        </div>
      </Modal>

      <Toaster
        position="bottom-right"
        theme={theme}
        closeButton
        gap={8}
        toastOptions={{
          style: {
            background: 'rgb(var(--panel2))',
            border: '1px solid rgb(var(--line))',
            color: 'rgb(var(--ink))',
            borderRadius: '10px',
            fontSize: '12px',
            boxShadow: '0 16px 40px -12px rgba(0,0,0,.55)',
          },
          className: 'rill-toast',
        }}
      />
    </div>
  )
}
