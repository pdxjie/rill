import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowUp,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  CornerDownLeft,
  Eraser,
  History,
  Lock,
  TerminalSquare,
  Trash2,
  X,
} from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import { useActiveConnection } from '../lib/store'
import type { ConsoleResult, ConsoleValue } from '../lib/types'
import { cn, copyText, formatNumber, jsonToHtml, tryPrettyJson } from '../lib/utils'
import { ConfirmDialog, IconButton } from '../components/ui'

interface Entry {
  id: number
  command: string
  result?: ConsoleResult
  error?: string
  running?: boolean
  ts: number
}

const DANGER = /^(FLUSHALL|FLUSHDB|SHUTDOWN|DEBUG|SCRIPT\s+FLUSH|CONFIG\s+SET|CLIENT\s+KILL)/i

const SUGGESTIONS = [
  { label: 'PING', hint: '连通性' },
  { label: 'DBSIZE', hint: 'Key 数量' },
  { label: 'INFO memory', hint: '内存详情' },
  { label: 'SLOWLOG GET 10', hint: '慢查询' },
  { label: 'SCAN 0 COUNT 50', hint: '游标扫描' },
  { label: 'CONFIG GET maxmemory', hint: '配置' },
]

export function ConsoleView() {
  const conn = useActiveConnection()
  const [entries, setEntries] = useState<Entry[]>([])
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [runningCount, setRunningCount] = useState(0)
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const counter = useRef(0)
  const historyKey = conn ? `rill.console.history.${conn.id}` : ''

  useEffect(() => {
    if (!historyKey) return
    try {
      const raw = localStorage.getItem(historyKey)
      setHistory(raw ? JSON.parse(raw) : [])
    } catch {
      setHistory([])
    }
    setEntries([])
    setHistoryIndex(-1)
  }, [historyKey])

  useEffect(() => {
    const el = outputRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries.length, runningCount])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(96, Math.max(30, el.scrollHeight))}px`
  }, [input])

  const persistHistory = useCallback(
    (command: string) => {
      if (!historyKey) return
      setHistory((prev) => {
        const next = [command, ...prev.filter((item) => item !== command)].slice(0, 100)
        localStorage.setItem(historyKey, JSON.stringify(next))
        return next
      })
      setHistoryIndex(-1)
    },
    [historyKey],
  )

  const execute = useCallback(
    async (raw: string) => {
      const command = raw.trim()
      if (!command || !conn) return
      const entryId = ++counter.current
      setEntries((prev) => [
        ...prev,
        { id: entryId, command, running: true, ts: Date.now() },
      ])
      setRunningCount((n) => n + 1)
      persistHistory(command)
      setInput('')
      try {
        const result = await api.execute(conn.id, command)
        setEntries((prev) =>
          prev.map((entry) => (entry.id === entryId ? { ...entry, result, running: false } : entry)),
        )
      } catch (err) {
        setEntries((prev) =>
          prev.map((entry) =>
            entry.id === entryId ? { ...entry, error: errorMessage(err), running: false } : entry,
          ),
        )
      } finally {
        setRunningCount((n) => Math.max(0, n - 1))
      }
    },
    [conn, persistHistory],
  )

  const submit = () => {
    const command = input.trim()
    if (!command) return
    if (DANGER.test(command) && !conn?.readOnly) {
      setPending(command)
      return
    }
    void execute(command)
  }

  if (!conn) return null

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex h-[44px] items-center gap-2 border-b border-line/70 px-4">
        <TerminalSquare size={14} className="text-accent" />
        <span className="text-xs font-medium text-ink">命令控制台</span>
        <span className="mono text-[12px] text-faint">
          {conn.host}:{conn.port} / db{conn.db}
        </span>
        {conn.readOnly ? (
          <span className="ml-1 flex items-center gap-1 rounded-[4px] bg-amber/10 px-1.5 py-[1px] text-[11.5px] font-medium text-amber">
            <Lock size={9} /> 只读保护
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[12px] text-faint">共 {formatNumber(entries.length)} 条</span>
          <IconButton icon={History} label="历史命令" active={historyOpen} onClick={() => setHistoryOpen((v) => !v)} />
          <IconButton
            icon={Eraser}
            label="清空输出"
            onClick={() => setEntries([])}
            disabled={!entries.length}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div ref={outputRef} className="scroll-area min-w-0 flex-1">
          {entries.length === 0 ? (
            <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-6">
              <div className="pointer-events-none absolute inset-0 grid-bg opacity-[0.16]" />
              <div className="relative flex w-full max-w-[560px] flex-col gap-5">
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-line bg-panel text-accent shadow-card">
                    <TerminalSquare size={22} strokeWidth={1.6} />
                  </div>
                  <p className="text-[15px] font-medium text-ink">直接与 Redis 对话</p>
                  <p className="max-w-[400px] text-xs leading-relaxed text-faint">
                    命令通过独立的多路复用连接执行，支持 RESP2 全部返回类型。危险命令会二次确认。
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {SUGGESTIONS.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => void execute(item.label)}
                      className="group flex flex-col items-start gap-1 rounded-[10px] border border-line bg-panel px-3 py-2 text-left transition hover:border-accent/30 hover:bg-panel2"
                    >
                      <span className="mono text-[12.5px] text-ink group-hover:text-accent">{item.label}</span>
                      <span className="text-[11.5px] text-faint">{item.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-line/50 px-4 py-2">
              {entries.map((entry) => (
                <ConsoleEntry key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>

        {historyOpen ? (
          <div className="flex w-[280px] shrink-0 flex-col border-l border-line/70 bg-panel/30">
            <div className="flex h-9 items-center justify-between border-b border-line/60 px-3">
              <span className="text-[12px] font-medium uppercase tracking-wider text-faint">历史命令</span>
              <div className="flex items-center gap-0.5">
                <IconButton
                  icon={Trash2}
                  label="清空历史"
                  className="h-6 w-6"
                  onClick={() => {
                    setHistory([])
                    if (historyKey) localStorage.removeItem(historyKey)
                  }}
                />
                <IconButton icon={X} label="关闭" className="h-6 w-6" onClick={() => setHistoryOpen(false)} />
              </div>
            </div>
            <div className="scroll-area flex-1 py-1">
              {history.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-faint">还没有执行过命令</p>
              ) : (
                history.map((command, index) => (
                  <button
                    key={`${command}-${index}`}
                    onClick={() => {
                      setInput(command)
                      setHistoryIndex(-1)
                      inputRef.current?.focus()
                    }}
                    className="group flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-elevated/60"
                  >
                    <span className="mt-[3px] text-[11.5px] tabular-nums text-faint">{index + 1}</span>
                    <span className="min-w-0 flex-1 break-all mono text-[12px] leading-relaxed text-muted group-hover:text-ink">
                      {command}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-line/80 bg-panel/40 px-3 pb-3 pt-2.5">
        <div className="flex items-end gap-2 rounded-[10px] border border-line bg-app px-3 py-2 transition focus-within:border-accent/45 focus-within:shadow-[0_0_0_3px_rgb(var(--accent)/0.09)]">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <span className="flex h-[30px] shrink-0 items-center mono text-[13px] leading-5 text-accent">
              ❯
            </span>
            <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
                return
              }
              if (event.key === 'ArrowUp' && !input.includes('\n') && history.length) {
                event.preventDefault()
                const next = Math.min(history.length - 1, historyIndex + 1)
                setHistoryIndex(next)
                setInput(history[next] ?? '')
              }
              if (event.key === 'ArrowDown' && !input.includes('\n') && history.length) {
                event.preventDefault()
                const next = historyIndex - 1
                setHistoryIndex(next)
                setInput(next < 0 ? '' : history[next] ?? '')
              }
              if (event.key === 'Escape') {
                setInput('')
                setHistoryIndex(-1)
              }
            }}
            placeholder="输入 Redis 命令，Enter 执行，Shift+Enter 换行，↑↓ 浏览历史"
            spellCheck={false}
            className="mono max-h-[96px] min-h-[30px] flex-1 resize-none border-0 bg-transparent px-0 py-[5px] text-[13px] leading-5 text-ink outline-none placeholder:text-faint"
          />
          </div>
          <div className="mb-[2px] flex shrink-0 items-center gap-1.5">
            {runningCount > 0 ? (
              <span className="flex items-center gap-1 text-[12px] text-muted">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-amber" /> 执行中
              </span>
            ) : (
              <span className="hidden items-center gap-1 text-[12px] text-faint sm:flex">
                <CornerDownLeft size={10} /> 执行
              </span>
            )}
            <button
              onClick={submit}
              disabled={!input.trim()}
              className="flex h-[26px] items-center gap-1 rounded-[6px] bg-accent px-2.5 text-[12.5px] font-medium text-white transition hover:brightness-110 disabled:opacity-30"
            >
              Run <ArrowUp size={10} className="rotate-90" />
            </button>
          </div>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-1 text-[11.5px] text-faint">
          <span className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="kbd">↑</span>
              <span className="kbd">↓</span> 历史
            </span>
            <span className="flex items-center gap-1">
              <span className="kbd">Esc</span> 清空输入
            </span>
          </span>
          <span className="flex items-center gap-1">
            <Clock3 size={9} /> 单条命令超时 30s
          </span>
        </div>
      </div>

      <ConfirmDialog
        open={!!pending}
        title="确认执行危险命令？"
        description={
          <span>
            <code className="mono text-red">{pending}</code> 可能删除数据或长时间阻塞 Redis，请确认目标实例：
            <span className="mono ml-1 text-ink">
              {conn.name} · {conn.host}:{conn.port}
            </span>
          </span>
        }
        confirmLabel="仍然执行"
        danger
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const command = pending
          setPending(null)
          if (command) void execute(command)
        }}
      />

    </div>
  )
}

function ConsoleEntry({ entry }: { entry: Entry }) {
  const [copied, setCopied] = useState(false)
  const copyResult = async () => {
    const text = entry.error ?? JSON.stringify(entry.result?.value ?? null, null, 2)
    if (await copyText(text)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    }
  }

  return (
    <div className="group py-2.5">
      <div className="flex items-center gap-2">
        <span className="mono text-[12.5px] text-accent">❯</span>
        <code className="min-w-0 flex-1 break-all mono text-[12.5px] font-medium text-ink">{entry.command}</code>
        {entry.result ? (
          <span className="shrink-0 text-[11.5px] tabular-nums text-faint">{entry.result.elapsedMs.toFixed(2)} ms</span>
        ) : null}
        <button
          onClick={() => void copyResult()}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint opacity-0 transition hover:bg-elevated hover:text-ink group-hover:opacity-100"
        >
          {copied ? <Check size={10} className="text-green" /> : <Copy size={10} />}
        </button>
      </div>
      <div className="ml-[21px] mt-1.5">
        {entry.running ? (
          <div className="flex items-center gap-2 py-1 text-[12px] text-faint">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-amber" />
            等待 Redis 响应…
          </div>
        ) : entry.error ? (
          <div className="flex items-start gap-2 rounded-[7px] border border-red/20 bg-red/5 px-2.5 py-2 text-[12.5px] leading-relaxed text-red">
            <AlertCircle size={12} className="mt-[2px] shrink-0" />
            <span className="mono whitespace-pre-wrap break-all">{entry.error}</span>
          </div>
        ) : entry.result ? (
          <ValueView value={entry.result.value} command={entry.command} />
        ) : null}
      </div>
    </div>
  )
}

function scalarText(value: ConsoleValue): string {
  switch (value.kind) {
    case 'nil':
      return '(nil)'
    case 'status':
      return value.value
    case 'bulk':
      return value.value
    case 'int':
      return String(value.value)
    case 'double':
      return String(value.value)
    case 'bool':
      return String(value.value)
    default:
      return ''
  }
}

function PairTable({
  pairs,
  keyLabel = 'Field',
  valueLabel = 'Value',
}: {
  pairs: [ConsoleValue, ConsoleValue][]
  keyLabel?: string
  valueLabel?: string
}) {
  return (
    <div className="overflow-hidden rounded-[7px] border border-line/70">
      <div className="grid grid-cols-[34px_1fr_1.2fr] gap-2 border-b border-line/70 bg-panel/60 px-2.5 py-1 text-[11.5px] font-medium uppercase tracking-wider text-faint">
        <span>#</span>
        <span>{keyLabel}</span>
        <span>{valueLabel}</span>
      </div>
      {pairs.map(([key, value], index) => (
        <div
          key={index}
          className={cn(
            'grid grid-cols-[34px_1fr_1.2fr] items-start gap-2 px-2.5 py-[3px] text-[12px]',
            index % 2 === 0 ? 'bg-app/30' : 'bg-transparent',
          )}
        >
          <span className="pt-[1px] text-[11.5px] tabular-nums text-faint">{index + 1}</span>
          <span className="min-w-0 break-all mono text-blue/90">{scalarText(key)}</span>
          <span className="min-w-0 break-all mono text-ink">{scalarText(value)}</span>
        </div>
      ))}
    </div>
  )
}

function InfoBulk({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="mono max-h-[420px] overflow-auto rounded-[7px] border border-line/70 bg-app/60 px-3 py-2 text-[12px] leading-[1.7]">
      {lines.map((line, index) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={index} className="h-2" />
        if (trimmed.startsWith('#')) {
          return (
            <div key={index} className="mt-1 font-semibold text-accent">
              {trimmed}
            </div>
          )
        }
        const colon = line.indexOf(':')
        if (colon > 0) {
          return (
            <div key={index} className="whitespace-pre-wrap break-all">
              <span className="text-blue/85">{line.slice(0, colon)}</span>
              <span className="text-faint">:</span>
              <span className="text-ink">{line.slice(colon + 1)}</span>
            </div>
          )
        }
        return (
          <div key={index} className="whitespace-pre-wrap break-all text-muted">
            {line}
          </div>
        )
      })}
    </div>
  )
}

function ValueView({
  value,
  depth = 0,
  command,
}: {
  value: ConsoleValue
  depth?: number
  command?: string
}) {
  if (value.kind === 'nil') {
    return <span className="mono text-[12.5px] text-faint">(nil)</span>
  }
  if (value.kind === 'int') {
    return <span className="mono text-[12.5px] tabular-nums text-amber">(integer) {value.value}</span>
  }
  if (value.kind === 'double') {
    return <span className="mono text-[12.5px] text-amber">(double) {value.value}</span>
  }
  if (value.kind === 'bool') {
    return <span className="mono text-[12.5px] text-violet">{value.value ? 'true' : 'false'}</span>
  }
  if (value.kind === 'status') {
    return <span className="mono text-[12.5px] text-green">{value.value}</span>
  }
  if (value.kind === 'bulk') {
    if (command && /^INFO(\s|$)/i.test(command.trim())) {
      return <InfoBulk text={value.value} />
    }
    const json = tryPrettyJson(value.value)
    if (json.ok && value.value.length < 200_000) {
      return (
        <pre className="mono max-h-[340px] overflow-auto rounded-[7px] border border-line/70 bg-app/60 px-3 py-2 text-[12.5px] leading-[1.65]">
          <code dangerouslySetInnerHTML={{ __html: jsonToHtml(json.text) }} />
        </pre>
      )
    }
    return (
      <pre className="mono max-h-[340px] overflow-auto whitespace-pre-wrap break-all rounded-[7px] border border-line/70 bg-app/60 px-3 py-2 text-[12.5px] leading-[1.65] text-ink">
        {value.value || <span className="text-faint">(empty)</span>}
      </pre>
    )
  }
  if (value.kind === 'array') {
    if (!value.value.length) {
      return <span className="mono text-[12.5px] text-faint">(empty array)</span>
    }
    const capped = value.value.length > 500
    const items = capped ? value.value.slice(0, 500) : value.value
    const allScalar = items.every((item) =>
      ['bulk', 'int', 'status', 'double', 'nil', 'bool'].includes(item.kind),
    )
    const pairMode =
      !!command &&
      (/^HGETALL\b/i.test(command.trim()) ||
        /^CONFIG\s+GET\b/i.test(command.trim()) ||
        (/^(ZRANGE|ZREVRANGE|ZRANGEBYSCORE|ZREVRANGEBYSCORE)\b/i.test(command.trim()) &&
          /WITHSCORES/i.test(command)))
    if (pairMode && allScalar && items.length % 2 === 0) {
      const pairs: [ConsoleValue, ConsoleValue][] = []
      for (let i = 0; i < items.length; i += 2) {
        pairs.push([items[i], items[i + 1]])
      }
      const isZset = /^Z/i.test(command!.trim())
      return (
        <PairTable
          pairs={pairs}
          keyLabel={isZset ? 'Member' : 'Field'}
          valueLabel={isZset ? 'Score' : 'Value'}
        />
      )
    }
    if (allScalar) {
      return (
        <div className="flex flex-col gap-1">
        <div className="overflow-hidden rounded-[7px] border border-line/70">
          {items.map((item, index) => (
            <div
              key={index}
              className={cn(
                'flex items-start gap-2 px-2.5 py-1 text-[12.5px]',
                index % 2 === 0 ? 'bg-app/40' : 'bg-transparent',
              )}
            >
              <span className="w-6 shrink-0 text-right text-[11.5px] tabular-nums text-faint">{index + 1}</span>
              <span className="min-w-0 flex-1 break-all mono">
                {item.kind === 'nil' ? (
                  <span className="text-faint">(nil)</span>
                ) : item.kind === 'int' ? (
                  <span className="tabular-nums text-amber">{item.value}</span>
                ) : item.kind === 'status' ? (
                  <span className="text-green">{item.value}</span>
                ) : item.kind === 'double' ? (
                  <span className="text-amber">{item.value}</span>
                ) : item.kind === 'bool' ? (
                  <span className="text-violet">{String(item.value)}</span>
                ) : item.kind === 'bulk' ? (
                  <span className="text-ink">{item.value || <span className="text-faint">(empty)</span>}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
        {capped ? (
          <p className="pl-2 text-[11.5px] text-amber">
            结果较大，仅显示前 500 项（共 {value.value.length} 项）
          </p>
        ) : null}
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-1.5">
        {items.map((item, index) => (
          <div key={index} className="flex items-start gap-2">
            <span className="mt-[3px] w-4 shrink-0 text-right text-[11.5px] tabular-nums text-faint">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <ValueView value={item} depth={depth + 1} />
            </div>
          </div>
        ))}
        {capped ? (
          <p className="pl-6 text-[11.5px] text-amber">
            结果较大，仅显示前 500 项（共 {value.value.length} 项）
          </p>
        ) : null}
      </div>
    )
  }
  if (value.kind === 'map') {
    if (!value.value.length) return <span className="mono text-[12.5px] text-faint">(empty map)</span>
    return (
      <div className="overflow-hidden rounded-[7px] border border-line/70">
        {value.value.map(([k, v], index) => (
          <div key={index} className="flex items-start gap-2 border-b border-line/40 px-2.5 py-1 last:border-0">
            <div className="w-[180px] shrink-0">
              <ValueView value={k} depth={depth + 1} />
            </div>
            <ChevronRight size={10} className="mt-[4px] shrink-0 text-faint" />
            <div className="min-w-0 flex-1">
              <ValueView value={v} depth={depth + 1} />
            </div>
          </div>
        ))}
      </div>
    )
  }
  return null
}
