import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Braces,
  Check,
  Clock,
  FileJson,
  Loader2,
  Lock,
  MousePointerClick,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  SearchX,
  Trash2,
  WrapText,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '../lib/api'
import type { ConnectionView, FieldValue, KeyDetail } from '../lib/types'
import {
  cn,
  formatBytes,
  formatInt,
  formatTtl,
  jsonToHtml,
  splitKey,
  tryPrettyJson,
} from '../lib/utils'
import { useAppStore } from '../lib/store'
import { TypeBadge, TypeGlyph } from '../components/TypeGlyph'
import {
  Button,
  ConfirmDialog,
  CopyButton,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  ModalHeader,
  Segmented,
  Skeleton,
} from '../components/ui'

const PAGE_SIZE = 100

export function ValuePanel({
  connection,
  redisKey,
  onDeleted,
  onRenamed,
  onMetaChanged,
}: {
  connection: ConnectionView
  redisKey: string | null
  onDeleted: () => void
  onRenamed: (key: string) => void
  onMetaChanged?: () => void
}) {
  const [detail, setDetail] = useState<KeyDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ttlOpen, setTtlOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const requestRef = useRef(0)

  const writable = !connection.readOnly

  const load = useCallback(
    async (silent = false) => {
      const token = ++requestRef.current
      if (!redisKey) {
        setDetail(null)
        setError(null)
        setLoading(false)
        setRefreshing(false)
        return
      }
      if (!silent) setLoading(true)
      else setRefreshing(true)
      try {
        const data = await api.keyDetail(connection.id, redisKey, PAGE_SIZE)
        if (token !== requestRef.current) return
        setDetail(data)
        setError(null)
      } catch (err) {
        if (token !== requestRef.current) return
        setError(errorMessage(err))
        setDetail(null)
      } finally {
        if (token === requestRef.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [connection.id, redisKey],
  )

  useEffect(() => {
    setDetail(null)
    setError(null)
    if (redisKey) setLoading(true)
    void load()
  }, [load, redisKey])

  useEffect(() => {
    const handler = () => void load(true)
    window.addEventListener('rill:refresh', handler)
    return () => window.removeEventListener('rill:refresh', handler)
  }, [load])

  if (!redisKey) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center overflow-hidden">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-[0.18]" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[340px] w-[460px] -translate-x-1/2 -translate-y-1/2 glow-accent" />
        <div className="relative flex flex-col items-center gap-4 px-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-panel text-faint shadow-card">
            <MousePointerClick size={24} strokeWidth={1.5} />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-[15px] font-medium text-ink">选择一个 Key 开始</p>
            <p className="max-w-[340px] text-xs leading-relaxed text-faint">
              左侧使用 SCAN 游标增量加载，不会阻塞 Redis。支持 String、Hash、List、Set、Sorted
              Set 与 Stream 的类型化编辑。
            </p>
          </div>
          <div className="flex items-center gap-3 text-[12px] text-faint">
            <span className="flex items-center gap-1">
              <span className="kbd">↑</span>
              <span className="kbd">↓</span> 切换
            </span>
            <span className="flex items-center gap-1">
              <span className="kbd">⌘K</span> 搜索
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (loading && !detail) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-[56px] items-center gap-3 border-b border-line/70 px-4">
          <Skeleton className="h-7 w-7 rounded-md" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-56" />
            <Skeleton className="h-2.5 w-72" />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={SearchX}
          title="无法读取这个 Key"
          description={error ?? 'Key 可能已被删除'}
          action={
            <div className="flex gap-2">
              <Button size="sm" icon={RefreshCw} onClick={() => void load()}>
                重试
              </Button>
              <Button size="sm" variant="ghost" onClick={onDeleted}>
                返回
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  const segments = splitKey(detail.meta.key)
  const ttlWarn = detail.meta.ttl >= 0 && detail.meta.ttl < 300

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex min-h-[58px] items-center gap-3 border-b border-line/70 px-4 py-2">
        <TypeGlyph type={detail.meta.keyType} size={28} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <div className="min-w-0 truncate mono text-[13px] font-medium text-ink" title={detail.meta.key}>
              {segments.map((segment, i) => (
                <span key={`${segment}-${i}`}>
                  {i > 0 ? <span className="px-[1px] text-faint/60">:</span> : null}
                  <span className={i === segments.length - 1 ? 'text-ink' : 'text-muted'}>{segment}</span>
                </span>
              ))}
            </div>
            <CopyButton value={detail.meta.key} label="复制 Key 名" />
            {!writable ? (
              <span className="ml-1 flex items-center gap-1 rounded-[4px] bg-amber/10 px-1.5 py-[1px] text-[11.5px] font-medium text-amber">
                <Lock size={9} /> 只读
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <TypeBadge type={detail.meta.keyType} />
            <button
              onClick={() => setTtlOpen(true)}
              className={cn(
                'inline-flex items-center gap-1 rounded-[5px] border px-1.5 py-[1px] text-[12px] font-medium transition',
                ttlWarn
                  ? 'border-amber/25 bg-amber/10 text-amber'
                  : 'border-line bg-panel text-muted hover:text-ink',
              )}
            >
              <Clock size={9} />
              {formatTtl(detail.meta.ttl)}
            </button>
            <span className="inline-flex items-center gap-1 rounded-[5px] border border-line bg-panel px-1.5 py-[1px] text-[12px] text-muted">
              {formatBytes(detail.meta.size ?? 0)}
            </span>
            {detail.encoding ? (
              <span className="mono rounded-[5px] border border-line bg-panel px-1.5 py-[1px] text-[11.5px] text-faint">
                {detail.encoding}
              </span>
            ) : null}
            <span className="text-[12px] text-faint">
              {formatInt(detail.length)} {detail.meta.keyType === 'string' ? 'bytes' : 'items'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton icon={RefreshCw} label="刷新" onClick={() => void load(true)} className={refreshing ? 'animate-spin' : ''} />
          <IconButton icon={Pencil} label="重命名" disabled={!writable} onClick={() => setRenameOpen(true)} />
          <IconButton
            icon={Trash2}
            label="删除 Key"
            disabled={!writable}
            className="hover:bg-red/10 hover:text-red"
            onClick={() => setDeleteOpen(true)}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {detail.value.kind === 'string' ? (
          <StringEditor
            detail={detail}
            connectionId={connection.id}
            writable={writable}
            onSaved={() => void load(true)}
          />
        ) : detail.value.kind === 'unsupported' ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <EmptyState
              icon={Braces}
              title="暂不支持可视化编辑"
              description={detail.value.note}
              action={
                <Button size="sm" variant="secondary" onClick={() => setTabConsole()}>
                  在控制台操作
                </Button>
              }
            />
          </div>
        ) : (
          <CollectionView
            key={`${detail.meta.key}-${detail.value.kind}`}
            detail={detail}
            connectionId={connection.id}
            writable={writable}
            onReload={() => void load(true)}
            onLoadMore={async () => {
              await loadMore(detail, connection.id, setDetail)
            }}
          />
        )}
      </div>

      <TtlModal
        open={ttlOpen}
        current={detail.meta.ttl}
        onClose={() => setTtlOpen(false)}
        onApply={async (seconds) => {
          try {
            if (seconds === null) {
              await api.persistKey(connection.id, detail.meta.key)
              toast.success('已移除过期时间')
            } else {
              await api.expireKey(connection.id, detail.meta.key, seconds)
              toast.success(`过期时间已设为 ${formatTtl(seconds)}`)
            }
            setTtlOpen(false)
            await load(true)
            onMetaChanged?.()
          } catch (err) {
            toast.error('设置失败', { description: errorMessage(err) })
          }
        }}
      />

      <RenameModal
        open={renameOpen}
        current={detail.meta.key}
        onClose={() => setRenameOpen(false)}
        onRename={async (next) => {
          try {
            await api.renameKey(connection.id, detail.meta.key, next)
            toast.success('Key 已重命名')
            setRenameOpen(false)
            onRenamed(next)
          } catch (err) {
            toast.error('重命名失败', { description: errorMessage(err) })
          }
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="删除这个 Key？"
        description={
          <span>
            将执行 <code className="mono text-red">DEL {detail.meta.key}</code>，此操作不可撤销。
          </span>
        }
        confirmLabel="删除"
        danger
        onCancel={() => setDeleteOpen(false)}
        onConfirm={async () => {
          try {
            await api.deleteKey(connection.id, detail.meta.key)
            setDeleteOpen(false)
            toast.success('Key 已删除')
            onDeleted()
          } catch (err) {
            toast.error('删除失败', { description: errorMessage(err) })
          }
        }}
      />
    </div>
  )
}

function setTabConsole() {
  useAppStore.getState().setTab('console')
}

async function loadMore(
  detail: KeyDetail,
  connectionId: string,
  setDetail: React.Dispatch<React.SetStateAction<KeyDetail | null>>,
) {
  const v = detail.value
  if (v.kind === 'string' || v.kind === 'unsupported') return
  const cursor =
    v.kind === 'list' ? String(v.nextStart) : v.kind === 'stream' ? v.lastId : String(v.cursor)
  try {
    const page = await api.keyPage(connectionId, detail.meta.key, detail.meta.keyType, cursor, PAGE_SIZE)
    setDetail((prev) => {
      if (!prev) return prev
      const current = prev.value
      if (current.kind === 'hash' && page.kind === 'hash') {
        return { ...prev, value: { ...current, items: [...current.items, ...page.items], cursor: page.cursor, done: page.done } }
      }
      if (current.kind === 'list' && page.kind === 'list') {
        return {
          ...prev,
          value: {
            ...current,
            items: [...current.items, ...page.items],
            nextStart: page.nextStart,
            done: page.done,
            total: page.total,
          },
        }
      }
      if (current.kind === 'set' && page.kind === 'set') {
        return { ...prev, value: { ...current, items: [...current.items, ...page.items], cursor: page.cursor, done: page.done } }
      }
      if (current.kind === 'zset' && page.kind === 'zset') {
        return { ...prev, value: { ...current, items: [...current.items, ...page.items], cursor: page.cursor, done: page.done } }
      }
      if (current.kind === 'stream' && page.kind === 'stream') {
        return {
          ...prev,
          value: {
            ...current,
            entries: [...current.entries, ...page.entries],
            lastId: page.lastId,
            done: page.done,
            total: page.total,
          },
        }
      }
      return prev
    })
  } catch (err) {
    toast.error('加载更多失败', { description: errorMessage(err) })
  }
}

function StringEditor({
  detail,
  connectionId,
  writable,
  onSaved,
}: {
  detail: KeyDetail
  connectionId: string
  writable: boolean
  onSaved: () => void
}) {
  const value = detail.value.kind === 'string' ? detail.value : null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [pretty, setPretty] = useState(true)
  const [wrap, setWrap] = useState(true)
  const [saving, setSaving] = useState(false)

  const json = useMemo(() => (value ? tryPrettyJson(value.text) : { ok: false, text: '' }), [value])
  const displayed = pretty && json.ok ? json.text : value?.text ?? ''

  useEffect(() => {
    if (!editing) setDraft(value?.text ?? '')
  }, [value?.text, editing])

  if (!value) return null

  const save = async () => {
    setSaving(true)
    try {
      await api.setString(connectionId, detail.meta.key, draft)
      toast.success('已保存', { description: `${new Blob([draft]).size} bytes` })
      setEditing(false)
      onSaved()
    } catch (err) {
      toast.error('保存失败', { description: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-line/60 bg-panel/40 px-3 py-1.5">
        {json.ok ? (
          <button
            onClick={() => setPretty((p) => !p)}
            className={cn(
              'inline-flex items-center gap-1 rounded-[5px] border px-1.5 py-[2px] text-[12px] font-medium transition',
              pretty ? 'border-blue/25 bg-blue/10 text-blue' : 'border-line bg-panel text-muted hover:text-ink',
            )}
          >
            <Braces size={10} /> JSON
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-[5px] border border-line bg-panel px-1.5 py-[2px] text-[12px] text-faint">
            <FileJson size={10} /> TEXT
          </span>
        )}
        <button
          onClick={() => setWrap((w) => !w)}
          className={cn(
            'inline-flex items-center gap-1 rounded-[5px] border px-1.5 py-[2px] text-[12px] font-medium transition',
            wrap ? 'border-line bg-elevated text-ink' : 'border-line bg-panel text-muted hover:text-ink',
          )}
        >
          <WrapText size={10} /> 换行
        </button>
        <span className="mono ml-1 text-[12px] text-faint">
          {formatInt(value.bytes)} bytes · {value.binary ? 'binary' : 'utf-8'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <CopyButton value={value.text} label="复制内容" />
          {writable ? (
            editing ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Braces}
                  disabled={!json.ok}
                  onClick={() => {
                    try {
                      setDraft(JSON.stringify(JSON.parse(draft), null, 2))
                    } catch {
                      toast.error('当前内容不是合法 JSON')
                    }
                  }}
                >
                  格式化
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={X}
                  onClick={() => {
                    setEditing(false)
                    setDraft(value.text)
                  }}
                >
                  取消
                </Button>
                <Button size="sm" variant="primary" icon={Save} loading={saving} onClick={() => void save()}>
                  保存
                </Button>
              </>
            ) : value.binary || value.truncated ? (
              <span className="flex items-center gap-1 text-[12px] text-faint">
                <Lock size={10} /> {value.truncated ? '已截断，只读' : '二进制，只读'}
              </span>
            ) : (
              <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                编辑
              </Button>
            )
          ) : null}
        </div>
      </div>

      {value.truncated ? (
        <div className="flex items-center gap-2 border-b border-amber/20 bg-amber/5 px-3 py-1.5 text-[12px] text-amber">
          <AlertTriangle size={11} />
          内容超过 512 KB，编辑器仅展示前 512 KB，避免阻塞界面。
        </div>
      ) : null}

      {editing ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                event.preventDefault()
                void save()
              }
              if (event.key === 'Escape') {
                setEditing(false)
                setDraft(value.text)
              }
            }}
            spellCheck={false}
            className="mono min-h-0 flex-1 resize-none border-0 bg-transparent px-4 py-3 text-[13px] leading-[1.7] text-ink outline-none"
          />
          <div className="flex items-center justify-between border-t border-line/60 px-3 py-1.5 text-[12px] text-faint">
            <span>
              {formatInt(draft.length)} 字符 · {formatBytes(new Blob([draft]).size)}
            </span>
            <span>⌘S 保存 · Esc 取消</span>
          </div>
        </div>
      ) : (
        <div className="scroll-area min-h-0 flex-1">
          <pre
            className={cn(
              'value-pre px-4 py-3 text-ink',
              !wrap && 'whitespace-pre',
            )}
          >
            {pretty && json.ok ? (
              <code dangerouslySetInnerHTML={{ __html: jsonToHtml(displayed) }} />
            ) : (
              <code>{displayed || <span className="text-faint">(empty string)</span>}</code>
            )}
          </pre>
        </div>
      )}
    </div>
  )
}

function CollectionView({
  detail,
  connectionId,
  writable,
  onReload,
  onLoadMore,
}: {
  detail: KeyDetail
  connectionId: string
  writable: boolean
  onReload: () => void
  onLoadMore: () => Promise<void>
}) {
  const [loadingMore, setLoadingMore] = useState(false)
  const value = detail.value
  if (value.kind === 'string' || value.kind === 'unsupported') return null

  const more = async () => {
    setLoadingMore(true)
    try {
      await onLoadMore()
    } finally {
      setLoadingMore(false)
    }
  }

  const loaded =
    value.kind === 'hash'
      ? value.items.length
      : value.kind === 'list'
        ? value.items.length
        : value.kind === 'set'
          ? value.items.length
          : value.kind === 'zset'
            ? value.items.length
            : value.entries.length
  const total = value.kind === 'list' ? value.total : value.kind === 'stream' ? value.total : value.total
  const done = value.done

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line/60 bg-panel/40 px-3 py-1.5 text-[12px] text-faint">
        <span>
          已加载 <span className="tabular-nums text-muted">{formatInt(loaded)}</span> / {formatInt(total)}
        </span>
        <span className="h-2.5 w-px bg-line" />
        <span>每页 {PAGE_SIZE}</span>
        {writable ? <span className="ml-auto text-faint">点击单元格即可编辑</span> : <span className="ml-auto">只读模式</span>}
      </div>

      <div className="scroll-area min-h-0 flex-1">
        {value.kind === 'hash' ? (
          <HashTable items={value.items} connectionId={connectionId} writable={writable} detail={detail} onReload={onReload} />
        ) : null}
        {value.kind === 'list' ? (
          <ListTable items={value.items} connectionId={connectionId} writable={writable} detail={detail} onReload={onReload} />
        ) : null}
        {value.kind === 'set' ? (
          <SetTable items={value.items} connectionId={connectionId} writable={writable} detail={detail} onReload={onReload} />
        ) : null}
        {value.kind === 'zset' ? (
          <ZSetTable items={value.items} connectionId={connectionId} writable={writable} detail={detail} onReload={onReload} />
        ) : null}
        {value.kind === 'stream' ? <StreamTable entries={value.entries} /> : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line/70 bg-panel/40 px-3 py-2">
        {!done ? (
          <Button size="sm" variant="secondary" icon={Loader2} loading={loadingMore} onClick={() => void more()}>
            加载更多
          </Button>
        ) : (
          <span className="flex items-center gap-1 text-[12px] text-faint">
            <Check size={10} className="text-green" /> 已全部加载
          </span>
        )}
        <CollectionAddBar detail={detail} connectionId={connectionId} writable={writable} onReload={onReload} />
      </div>
    </div>
  )
}

function HashTable({
  items,
  connectionId,
  writable,
  detail,
  onReload,
}: {
  connectionId: string
  items: FieldValue[]
  writable: boolean
  detail: KeyDetail
  onReload: () => void
}) {
  return (
    <table className="w-full table-fixed border-collapse text-xs">
      <thead className="sticky top-0 z-[1] bg-panel2/95 backdrop-blur">
        <tr className="border-b border-line text-[11.5px] uppercase tracking-wider text-faint">
          <th className="w-10 px-3 py-1.5 text-left font-medium">#</th>
          <th className="w-[36%] px-2 py-1.5 text-left font-medium">Field</th>
          <th className="px-2 py-1.5 text-left font-medium">Value</th>
          <th className="w-9 px-2 py-1.5" />
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          <tr key={item.field} className="group border-b border-line/50 hover:bg-elevated/40">
            <td className="px-3 py-1 text-[12px] tabular-nums text-faint">{index + 1}</td>
            <td className="px-2 py-0.5">
              <span className="block truncate mono text-[12.5px] text-blue/90" title={item.field}>
                {item.field}
              </span>
            </td>
            <td className="px-2 py-0.5">
              <EditableCell
                value={item.value}
                disabled={!writable}
                onCommit={async (next) => {
                  await api.hashSet(connectionId, detail.meta.key, item.field, next)
                  toast.success('字段已更新')
                  onReload()
                }}
              />
            </td>
            <td className="px-1">
              {writable ? (
                <button
                  className="flex h-5 w-5 items-center justify-center rounded text-faint opacity-0 transition hover:bg-red/10 hover:text-red group-hover:opacity-100"
                  title="删除字段"
                  onClick={async () => {
                    try {
                      await api.hashDel(connectionId, detail.meta.key, item.field)
                      toast.success('字段已删除')
                      onReload()
                    } catch (err) {
                      toast.error('删除失败', { description: errorMessage(err) })
                    }
                  }}
                >
                  <Trash2 size={11} />
                </button>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ListTable({
  items,
  connectionId,
  writable,
  detail,
  onReload,
}: {
  connectionId: string
  items: { index: number; value: string }[]
  writable: boolean
  detail: KeyDetail
  onReload: () => void
}) {
  return (
    <table className="w-full table-fixed border-collapse text-xs">
      <thead className="sticky top-0 z-[1] bg-panel2/95 backdrop-blur">
        <tr className="border-b border-line text-[11.5px] uppercase tracking-wider text-faint">
          <th className="w-16 px-3 py-1.5 text-left font-medium">Index</th>
          <th className="px-2 py-1.5 text-left font-medium">Value</th>
          <th className="w-9 px-2 py-1.5" />
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.index} className="group border-b border-line/50 hover:bg-elevated/40">
            <td className="px-3 py-1 mono text-[12px] tabular-nums text-faint">{item.index}</td>
            <td className="px-2 py-0.5">
              <EditableCell
                value={item.value}
                disabled={!writable}
                onCommit={async (next) => {
                  try {
                    await api.listSet(connectionId, detail.meta.key, item.index, next)
                    toast.success('元素已更新')
                    onReload()
                  } catch (err) {
                    toast.error('更新失败', { description: errorMessage(err) })
                  }
                }}
              />
            </td>
            <td className="px-1">
              {writable ? (
                <button
                  className="flex h-5 w-5 items-center justify-center rounded text-faint opacity-0 transition hover:bg-red/10 hover:text-red group-hover:opacity-100"
                  title="按值删除（LREM 1）"
                  onClick={async () => {
                    try {
                      await api.listRemove(connectionId, detail.meta.key, item.value)
                      toast.success('元素已删除')
                      onReload()
                    } catch (err) {
                      toast.error('删除失败', { description: errorMessage(err) })
                    }
                  }}
                >
                  <Trash2 size={11} />
                </button>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SetTable({
  items,
  connectionId,
  writable,
  detail,
  onReload,
}: {
  connectionId: string
  items: string[]
  writable: boolean
  detail: KeyDetail
  onReload: () => void
}) {
  return (
    <div className="flex flex-col">
      {items.map((member, index) => (
        <div
          key={member}
          className="group flex items-center gap-2 border-b border-line/50 px-3 py-1.5 hover:bg-elevated/40"
        >
          <span className="w-8 shrink-0 text-[12px] tabular-nums text-faint">{index + 1}</span>
          <span className="min-w-0 flex-1 truncate mono text-[12.5px] text-ink" title={member}>
            {member}
          </span>
          <CopyButton value={member} />
          {writable ? (
            <button
              className="flex h-5 w-5 items-center justify-center rounded text-faint opacity-0 transition hover:bg-red/10 hover:text-red group-hover:opacity-100"
              title="移除成员"
              onClick={async () => {
                try {
                  await api.setRemove(connectionId, detail.meta.key, member)
                  toast.success('成员已移除')
                  onReload()
                } catch (err) {
                  toast.error('移除失败', { description: errorMessage(err) })
                }
              }}
            >
              <Trash2 size={11} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function ZSetTable({
  items,
  connectionId,
  writable,
  detail,
  onReload,
}: {
  connectionId: string
  items: { member: string; score: number }[]
  writable: boolean
  detail: KeyDetail
  onReload: () => void
}) {
  return (
    <table className="w-full table-fixed border-collapse text-xs">
      <thead className="sticky top-0 z-[1] bg-panel2/95 backdrop-blur">
        <tr className="border-b border-line text-[11.5px] uppercase tracking-wider text-faint">
          <th className="w-10 px-3 py-1.5 text-left font-medium">#</th>
          <th className="px-2 py-1.5 text-left font-medium">Member</th>
          <th className="w-[92px] px-2 py-1.5 text-right font-medium">Score</th>
          <th className="w-9 px-2 py-1.5" />
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          <tr key={item.member} className="group border-b border-line/50 hover:bg-elevated/40">
            <td className="px-3 py-1 text-[12px] tabular-nums text-faint">
              <span className="rounded bg-green/10 px-1 text-[11.5px] text-green">{index + 1}</span>
            </td>
            <td className="px-2 py-0.5">
              <span className="block truncate mono text-[12.5px] text-ink" title={item.member}>
                {item.member}
              </span>
            </td>
            <td className="px-2 py-0.5">
              <EditableCell
                value={String(item.score)}
                align="right"
                disabled={!writable}
                onCommit={async (next) => {
                  const score = Number(next)
                  if (Number.isNaN(score)) {
                    toast.error('Score 必须是数字')
                    return
                  }
                  try {
                    await api.zsetAdd(connectionId, detail.meta.key, item.member, score)
                    toast.success('Score 已更新')
                    onReload()
                  } catch (err) {
                    toast.error('更新失败', { description: errorMessage(err) })
                  }
                }}
              />
            </td>
            <td className="px-1">
              {writable ? (
                <button
                  className="flex h-5 w-5 items-center justify-center rounded text-faint opacity-0 transition hover:bg-red/10 hover:text-red group-hover:opacity-100"
                  title="移除成员"
                  onClick={async () => {
                    try {
                      await api.zsetRemove(connectionId, detail.meta.key, item.member)
                      toast.success('成员已移除')
                      onReload()
                    } catch (err) {
                      toast.error('移除失败', { description: errorMessage(err) })
                    }
                  }}
                >
                  <Trash2 size={11} />
                </button>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function StreamTable({ entries }: { entries: { id: string; fields: FieldValue[] }[] }) {
  return (
    <div className="flex flex-col">
      {entries.map((entry) => (
        <div key={entry.id} className="border-b border-line/50 px-3 py-2 hover:bg-elevated/30">
          <div className="mb-1 flex items-center gap-2">
            <span className="mono rounded bg-cyan/10 px-1.5 py-[1px] text-[12px] text-cyan">{entry.id}</span>
            <span className="text-[11.5px] text-faint">{entry.fields.length} fields</span>
          </div>
          <div className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-0.5">
            {entry.fields.map((field, i) => (
              <div key={`${field.field}-${i}`} className="contents">
                <span className="truncate mono text-[12px] text-blue/80" title={field.field}>
                  {field.field}
                </span>
                <span className="min-w-0 truncate text-[12.5px] text-ink" title={field.value}>
                  {field.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function EditableCell({
  value,
  onCommit,
  disabled,
  align = 'left',
}: {
  value: string
  onCommit: (next: string) => Promise<void>
  disabled?: boolean
  align?: 'left' | 'right'
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  useEffect(() => setDraft(value), [value])

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setEditing(true)}
        className={cn(
          'block w-full truncate rounded px-1 py-[1px] text-left text-[12.5px] text-ink transition hover:bg-elevated',
          align === 'right' && 'text-right',
          disabled && 'cursor-default',
        )}
        title={value}
      >
        {value || <span className="text-faint">(空)</span>}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={async () => {
          if (saving) return
          setEditing(false)
          if (draft !== value) {
            setSaving(true)
            try {
              await onCommit(draft)
            } finally {
              setSaving(false)
            }
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        className="h-[22px] w-full rounded border border-accent/50 bg-app px-1 text-[12.5px] text-ink outline-none"
      />
      {saving ? <Loader2 size={11} className="animate-spin text-faint" /> : null}
    </div>
  )
}

function CollectionAddBar({
  detail,
  connectionId,
  writable,
  onReload,
}: {
  detail: KeyDetail
  connectionId: string
  writable: boolean
  onReload: () => void
}) {
  const kind = detail.value.kind
  const [field, setField] = useState('')
  const [second, setSecond] = useState('')
  const [position, setPosition] = useState<'tail' | 'head'>('tail')
  const [busy, setBusy] = useState(false)

  if (!writable || kind === 'stream' || kind === 'string' || kind === 'unsupported') {
    return kind === 'stream' ? (
      <span className="text-[12px] text-faint">Stream 只读展示，使用 XADD 写入</span>
    ) : null
  }

  const submit = async () => {
    if (!field.trim()) return
    if (kind === 'zset' && Number.isNaN(Number(second))) {
      toast.error('Score 必须是数字')
      return
    }
    setBusy(true)
    try {
      if (kind === 'hash') {
        if (!field) return
        await api.hashSet(connectionId, detail.meta.key, field, second)
        setField('')
        setSecond('')
      } else if (kind === 'list') {
        await api.listPush(connectionId, detail.meta.key, field, position === 'head')
        setField('')
      } else if (kind === 'set') {
        await api.setAdd(connectionId, detail.meta.key, field)
        setField('')
      } else if (kind === 'zset') {
        const score = Number(second)
        if (Number.isNaN(score)) {
          toast.error('Score 必须是数字')
          return
        }
        await api.zsetAdd(connectionId, detail.meta.key, field, score)
        setField('')
        setSecond('')
      }
      toast.success('已添加')
      onReload()
    } catch (err) {
      toast.error('添加失败', { description: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-end gap-1.5">
      {kind === 'list' ? (
        <Segmented
          size="sm"
          value={position}
          onChange={setPosition}
          options={[
            { value: 'tail', label: '尾部' },
            { value: 'head', label: '头部' },
          ]}
        />
      ) : null}
      <input
        value={field}
        onChange={(event) => setField(event.target.value)}
        placeholder={kind === 'hash' ? 'field' : kind === 'zset' ? 'member' : 'value'}
        className="h-[26px] w-[150px] rounded-[6px] border border-line bg-panel px-2 mono text-[12.5px] outline-none placeholder:text-faint focus:border-accent/60"
        onKeyDown={(event) => {
          if (event.key === 'Enter') void submit()
        }}
      />
      {kind === 'hash' ? (
        <input
          value={second}
          onChange={(event) => setSecond(event.target.value)}
          placeholder="value"
          className="h-[26px] w-[150px] rounded-[6px] border border-line bg-panel px-2 mono text-[12.5px] outline-none placeholder:text-faint focus:border-accent/60"
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit()
          }}
        />
      ) : null}
      {kind === 'zset' ? (
        <input
          value={second}
          onChange={(event) => setSecond(event.target.value)}
          placeholder="score"
          className="h-[26px] w-[72px] rounded-[6px] border border-line bg-panel px-2 text-right mono text-[12.5px] outline-none placeholder:text-faint focus:border-accent/60"
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit()
          }}
        />
      ) : null}
      <Button size="sm" variant="secondary" icon={Plus} loading={busy} onClick={() => void submit()}>
        添加
      </Button>
    </div>
  )
}

function TtlModal({
  open,
  current,
  onClose,
  onApply,
}: {
  open: boolean
  current: number
  onClose: () => void
  onApply: (seconds: number | null) => Promise<void>
}) {
  const [seconds, setSeconds] = useState('3600')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setSeconds(current > 0 ? String(current) : '3600')
  }, [open, current])

  return (
    <Modal open={open} onClose={onClose} width={420}>
      <ModalHeader icon={Clock} title="设置过期时间" description="TTL 到期后 Redis 会自动删除该 Key。" onClose={onClose} />
      <div className="flex flex-col gap-3 p-5">
        <div className="flex gap-1.5">
          {[
            ['60', '1 分钟'],
            ['600', '10 分钟'],
            ['3600', '1 小时'],
            ['86400', '1 天'],
            ['604800', '7 天'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setSeconds(value)}
              className={cn(
                'flex-1 rounded-[7px] border px-2 py-1.5 text-[12.5px] transition',
                seconds === value
                  ? 'border-accent/40 bg-accent/10 text-accent'
                  : 'border-line bg-panel text-muted hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Field label="自定义秒数" hint={`当前 TTL：${formatTtl(current)}`}>
          <Input
            type="number"
            value={seconds}
            min={1}
            onChange={(event) => setSeconds(event.target.value)}
            className="mono"
          />
        </Field>
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="ghost"
            size="sm"
            icon={Lock}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onApply(null)
              } finally {
                setBusy(false)
              }
            }}
          >
            设为永久
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                const value = Number(seconds)
                if (!value || value <= 0) {
                  toast.error('请输入大于 0 的秒数')
                  return
                }
                setBusy(true)
                try {
                  await onApply(value)
                } finally {
                  setBusy(false)
                }
              }}
            >
              应用
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function RenameModal({
  open,
  current,
  onClose,
  onRename,
}: {
  open: boolean
  current: string
  onClose: () => void
  onRename: (next: string) => Promise<void>
}) {
  const [value, setValue] = useState(current)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setValue(current)
  }, [open, current])

  return (
    <Modal open={open} onClose={onClose} width={460}>
      <ModalHeader icon={Pencil} title="重命名 Key" description="如果目标 Key 已存在，它会被覆盖。" onClose={onClose} />
      <div className="flex flex-col gap-4 p-5">
        <Field label="当前 Key">
          <div className="truncate rounded-[8px] border border-line bg-app px-3 py-2 mono text-xs text-muted">{current}</div>
        </Field>
        <Field label="新的 Key 名称">
          <Input autoFocus value={value} onChange={(event) => setValue(event.target.value)} className="mono" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!value.trim() || value === current}
            onClick={async () => {
              setBusy(true)
              try {
                await onRename(value.trim())
              } finally {
                setBusy(false)
              }
            }}
          >
            重命名
          </Button>
        </div>
      </div>
    </Modal>
  )
}
