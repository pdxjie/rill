import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  Bell,
  BellOff,
  Pause,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage, isMock, onPubSubMessage } from '../lib/api'
import { useActiveConnection } from '../lib/store'
import type { PubSubMessage } from '../lib/types'
import {
  cn,
  formatClock,
  formatInt,
  jsonToHtml,
  tryPrettyJson,
} from '../lib/utils'
import { Button, EmptyState, IconButton, Skeleton } from '../components/ui'

const CHANNEL_COLORS = ['#FF6B57', '#A78BFA', '#22D3EE', '#4ADE80', '#FBBF24', '#F472B6']

function channelColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 997
  return CHANNEL_COLORS[hash % CHANNEL_COLORS.length]
}

const SAMPLE_PAYLOADS = [
  JSON.stringify({ event: 'order.paid', order_no: 'SO20261116003', amount: 1139, ts: Date.now() }, null, 2),
  JSON.stringify({ event: 'cache.invalidate', keys: ['cache:sku:8831', 'cache:homepage:feed'] }, null, 2),
  JSON.stringify({ event: 'notification.push', uid: 100238, title: '你的订单已发货', channel: 'app' }, null, 2),
  '{"type":"stock.changed","sku":"MC-8831","delta":-1,"stock":127}',
  'heartbeat',
]

export function PubSubView() {
  const conn = useActiveConnection()
  const [channels, setChannels] = useState<string[]>([])
  const [channelsLoading, setChannelsLoading] = useState(true)
  const [subscribed, setSubscribed] = useState<string[]>([])
  const [subscribeInput, setSubscribeInput] = useState('notifications')
  const [messages, setMessages] = useState<PubSubMessage[]>([])
  const [paused, setPaused] = useState(false)
  const [filter, setFilter] = useState('')
  const [publishChannel, setPublishChannel] = useState('notifications')
  const [payload, setPayload] = useState('{"event":"test","from":"rill"}')
  const [publishing, setPublishing] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const subscribedRef = useRef<string[]>([])
  const connIdRef = useRef<string | undefined>(conn?.id)

  useEffect(() => {
    subscribedRef.current = subscribed
  }, [subscribed])

  const loadChannels = useCallback(async () => {
    if (!conn) return
    setChannelsLoading(true)
    try {
      const list = await api.pubsubChannels(conn.id)
      setChannels(list)
    } catch (err) {
      toast.error('读取频道失败', { description: errorMessage(err) })
    } finally {
      setChannelsLoading(false)
    }
  }, [conn])

  useEffect(() => {
    connIdRef.current = conn?.id
  }, [conn?.id])

  useEffect(() => {
    void loadChannels()
    return () => {
      if (connIdRef.current) void api.pubsubStop(connIdRef.current)
    }
  }, [loadChannels, conn?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void onPubSubMessage((message) => {
      setMessages((prev) => [...prev.slice(-299), message])
    }).then((fn) => {
      unlisten = fn
    })
    return () => unlisten?.()
  }, [])

  useEffect(() => {
    if (!isMock || subscribed.length === 0) return
    const timer = window.setInterval(() => {
      const active = subscribedRef.current
      if (!active.length) return
      const channel = active[Math.floor(Math.random() * active.length)].replace('*', 'order.events')
      setMessages((prev) =>
        [...prev.slice(-299), {
          channel,
          payload: SAMPLE_PAYLOADS[Math.floor(Math.random() * SAMPLE_PAYLOADS.length)],
          ts: Date.now(),
        }],
      )
    }, 2000)
    return () => window.clearInterval(timer)
  }, [subscribed])

  useEffect(() => {
    if (paused) return
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, paused])

  const subscribe = async (names: string[]) => {
    if (!conn) return
    const clean = names.map((n) => n.trim()).filter(Boolean)
    if (!clean.length) return
    setSubscribing(true)
    try {
      const active = await api.pubsubStart(conn.id, clean)
      setSubscribed(active)
      setMessages([])
      toast.success('订阅成功', { description: active.join(', ') })
    } catch (err) {
      toast.error('订阅失败', { description: errorMessage(err) })
    } finally {
      setSubscribing(false)
    }
  }

  const unsubscribe = async () => {
    if (!conn) return
    try {
      await api.pubsubStop(conn.id)
      setSubscribed([])
      toast.success('已停止订阅')
    } catch (err) {
      toast.error('退订失败', { description: errorMessage(err) })
    }
  }

  const removeChannel = async (channel: string) => {
    const next = subscribed.filter((item) => item !== channel)
    if (!next.length) {
      await unsubscribe()
      return
    }
    await subscribe(next)
  }

  const publish = async () => {
    if (!conn || !publishChannel.trim()) return
    setPublishing(true)
    try {
      const quote = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
      await api.execute(conn.id, `PUBLISH ${quote(publishChannel.trim())} ${quote(payload)}`)
      toast.success('消息已发布', { description: publishChannel })
    } catch (err) {
      toast.error('发布失败', { description: errorMessage(err) })
    } finally {
      setPublishing(false)
    }
  }

  const filteredMessages = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return messages
    return messages.filter(
      (message) =>
        message.channel.toLowerCase().includes(q) || message.payload.toLowerCase().includes(q),
    )
  }, [messages, filter])

  if (!conn) return null

  return (
    <div className="flex h-full min-w-0">
      <aside className="flex w-[290px] shrink-0 flex-col border-r border-line/70">
        <div className="flex h-[40px] items-center gap-1.5 border-b border-line/70 px-3">
          <Radio size={12} className="text-accent" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">频道</span>
          <span className="text-[11.5px] text-faint">PUBSUB CHANNELS</span>
          <IconButton icon={RefreshCw} label="刷新频道" className="ml-auto h-6 w-6" onClick={() => void loadChannels()} />
        </div>
        <div className="scroll-area min-h-0 flex-1 border-b border-line/60 py-1">
          {channelsLoading ? (
            <div className="flex flex-col gap-1 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-7 rounded-md" />
              ))}
            </div>
          ) : channels.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-faint">当前没有活跃频道</p>
          ) : (
            channels.map((channel) => {
              const active = subscribed.includes(channel)
              return (
                <button
                  key={channel}
                  onClick={() => (active ? void removeChannel(channel) : void subscribe([channel]))}
                  className={cn(
                    'group flex h-[30px] w-full items-center gap-2 px-3 text-left transition',
                    active ? 'bg-elevated' : 'hover:bg-panel2/70',
                  )}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: channelColor(channel), boxShadow: active ? `0 0 8px ${channelColor(channel)}` : undefined }}
                  />
                  <span className="min-w-0 flex-1 truncate mono text-[12px] text-ink">{channel}</span>
                  {active ? (
                    <span className="text-[11.5px] font-medium uppercase text-green">on</span>
                  ) : (
                    <Plus size={9} className="text-faint opacity-0 transition group-hover:opacity-100" />
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="flex flex-col gap-2 border-b border-line/60 p-3">
          <label className="text-[11.5px] font-medium uppercase tracking-wider text-faint">订阅（支持 * 通配）</label>
          <div className="flex gap-1.5">
            <input
              value={subscribeInput}
              onChange={(event) => setSubscribeInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void subscribe(subscribeInput.split(','))
              }}
              placeholder="order.*, notifications"
              className="h-[27px] min-w-0 flex-1 rounded-[6px] border border-line bg-panel px-2 mono text-[12px] outline-none placeholder:text-faint focus:border-accent/50"
            />
            <Button
              size="sm"
              variant={subscribed.length ? 'secondary' : 'primary'}
              loading={subscribing}
              onClick={() => void subscribe(subscribeInput.split(','))}
            >
              订阅
            </Button>
          </div>
          {subscribed.length ? (
            <div className="flex flex-wrap gap-1">
              {subscribed.map((channel) => (
                <span
                  key={channel}
                  className="inline-flex items-center gap-1 rounded-[5px] border border-line bg-panel px-1.5 py-[1px] mono text-[11.5px] text-muted"
                >
                  <span className="h-1 w-1 rounded-full" style={{ background: channelColor(channel) }} />
                  {channel}
                  <button onClick={() => void removeChannel(channel)} className="text-faint hover:text-red">
                    <X size={8} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11.5px] leading-relaxed text-faint">订阅使用独立连接，不会阻塞键空间操作。</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-line/60 p-3">
          <label className="flex items-center gap-1 text-[11.5px] font-medium uppercase tracking-wider text-faint">
            <Send size={9} /> 发布消息
          </label>
          <input
            value={publishChannel}
            onChange={(event) => setPublishChannel(event.target.value)}
            className="h-[26px] rounded-[6px] border border-line bg-panel px-2 mono text-[12px] outline-none focus:border-accent/50"
            placeholder="channel"
          />
          <textarea
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            spellCheck={false}
            className="mono h-[92px] resize-none rounded-[7px] border border-line bg-panel px-2 py-1.5 text-[12px] leading-relaxed outline-none focus:border-accent/50"
            placeholder='{"event":"test"}'
          />
          <Button
            size="sm"
            variant="secondary"
            icon={Send}
            loading={publishing}
            disabled={conn.readOnly}
            onClick={() => void publish()}
          >
            发布
          </Button>
          {conn.readOnly ? (
            <p className="text-[11.5px] text-amber">只读保护已开启，无法发布消息。</p>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-[44px] items-center gap-2 border-b border-line/70 px-4 py-2">
          <span className={cn('h-1.5 w-1.5 rounded-full', subscribed.length ? 'animate-pulse-dot bg-green' : 'bg-faint')} />
          <h1 className="text-sm font-semibold text-ink">消息流</h1>
          <span className="text-[12px] text-faint">
            {subscribed.length ? `订阅 ${subscribed.length} 个频道 · 实时` : '未订阅'}
          </span>
          <span className="ml-2 rounded-[4px] border border-line bg-panel px-1.5 py-[1px] text-[11.5px] tabular-nums text-muted">
            {formatInt(messages.length)}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="筛选消息"
              className="h-[26px] w-[140px] rounded-[6px] border border-line bg-panel px-2 text-[12px] outline-none placeholder:text-faint focus:border-accent/50"
            />
            <IconButton
              icon={paused ? Play : Pause}
              label={paused ? '继续滚动' : '暂停滚动'}
              active={paused}
              onClick={() => setPaused((p) => !p)}
            />
            <IconButton icon={Trash2} label="清空消息" onClick={() => setMessages([])} disabled={!messages.length} />
            {subscribed.length ? (
              <Button size="sm" variant="danger" icon={BellOff} onClick={() => void unsubscribe()}>
                停止订阅
              </Button>
            ) : null}
          </div>
        </div>

        <div ref={listRef} className="scroll-area min-h-0 flex-1">
          {!subscribed.length ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                icon={Bell}
                title="还没有订阅频道"
                description="从左侧选择频道，或输入 order.* 这样的通配符开始接收实时消息。"
              />
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                icon={Radio}
                compact
                title="等待消息…"
                description={filter ? '没有匹配筛选条件的消息' : `正在监听 ${subscribed.join(', ')}`}
              />
            </div>
          ) : (
            <div className="divide-y divide-line/40">
              {filteredMessages.map((message, index) => {
                const json = tryPrettyJson(message.payload)
                return (
                  <div key={`${message.ts}-${index}`} className="group px-4 py-2.5 hover:bg-elevated/20">
                    <div className="flex items-center gap-2">
                      <span className="mono text-[11.5px] tabular-nums text-faint">{formatClock(message.ts)}</span>
                      <span
                        className="rounded-[4px] px-1.5 py-[1px] mono text-[11.5px] font-medium"
                        style={{ background: `${channelColor(message.channel)}18`, color: channelColor(message.channel) }}
                      >
                        {message.channel}
                      </span>
                      {message.pattern ? (
                        <span className="text-[11.5px] text-faint">pattern: {message.pattern}</span>
                      ) : null}
                      <span className="ml-auto text-[11.5px] text-faint">{message.payload.length} B</span>
                    </div>
                    {json.ok ? (
                      <pre className="mono mt-1.5 max-h-[180px] overflow-auto rounded-[6px] border border-line/50 bg-app/40 px-2.5 py-1.5 text-[12px] leading-[1.65]">
                        <code dangerouslySetInnerHTML={{ __html: jsonToHtml(json.text) }} />
                      </pre>
                    ) : (
                      <pre className="mono mt-1.5 whitespace-pre-wrap break-all text-[12px] leading-[1.65] text-ink">
                        {message.payload}
                      </pre>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex h-[28px] shrink-0 items-center justify-between border-t border-line/70 bg-panel/30 px-4 text-[11.5px] text-faint">
          <span className="flex items-center gap-1">
            <ArrowDown size={9} /> {paused ? '自动滚动已暂停' : '自动滚动到底部'} · 最多保留 300 条
          </span>
          <span>PUBLISH / SUBSCRIBE · RESP2</span>
        </div>
      </div>
    </div>
  )
}
