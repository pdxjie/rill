import { Keyboard, Moon, Plus, Search, Sun } from 'lucide-react'
import { isTauri } from '../lib/api'
import { useAppStore } from '../lib/store'
import { cn } from '../lib/utils'
import { Logo } from './Logo'
import { IconButton, Kbd } from './ui'

export function TitleBar({ onShortcuts }: { onShortcuts: () => void }) {
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const openPalette = useAppStore((s) => s.openPalette)
  const openModal = useAppStore((s) => s.openModal)

  return (
    <header
      className={`titlebar relative z-30 flex h-[48px] shrink-0 items-center pr-3 ${isTauri ? 'pl-[88px]' : 'pl-4'}`}
    >
      {/* A dedicated drag surface behind the controls: empty titlebar space
          always starts a native window drag, even when it is covered by layout. */}
      <div data-tauri-drag-region className="absolute inset-0 z-0" />

      <div className="pointer-events-none relative z-10 flex w-full items-center">
        <div className="flex w-[150px] shrink-0 select-none items-center gap-2">
          <Logo size={19} className="text-accent" />
          <span className="text-[14px] font-semibold tracking-[-0.02em] text-ink">rill</span>
          <span className="mt-[1px] text-[9px] font-medium uppercase tracking-[0.14em] text-faint">redis</span>
        </div>

        <div className="flex flex-1 justify-center px-4">
          <button
            onClick={openPalette}
            className="no-drag pointer-events-auto group flex h-[29px] w-full max-w-[340px] items-center gap-2 rounded-[8px] border border-line bg-panel/70 px-2.5 text-left transition hover:border-linestrong hover:bg-panel"
          >
            <Search size={12} className="text-faint transition group-hover:text-muted" />
            <span className="flex-1 truncate text-[11px] text-faint">搜索连接、Key 或操作</span>
            <span className="flex items-center gap-0.5">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
        </div>

        <div data-tauri-drag-region className="no-drag pointer-events-auto flex w-[150px] shrink-0 items-center justify-end gap-0.5">
          <IconButton
            icon={theme === 'dark' ? Sun : Moon}
            label={theme === 'dark' ? '切换到浅色' : '切换到深色'}
            onClick={toggleTheme}
          />
          <IconButton icon={Keyboard} label="快捷键" onClick={onShortcuts} />
          <div className="mx-1 h-4 w-px bg-line" />
          <button
            onClick={() => openModal(null)}
            className={cn(
              'flex h-[27px] items-center gap-1 rounded-[7px] border border-line bg-elevated px-2 text-[11px] font-medium text-ink transition hover:border-linestrong hover:bg-panel2',
            )}
          >
            <Plus size={12} className="text-accent" />
            新建
          </button>
        </div>
      </div>
    </header>
  )
}
