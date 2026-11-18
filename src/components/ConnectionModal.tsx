import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Network,
  Plus,
  Shield,
  Trash2,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, errorMessage } from '../lib/api'
import { useAppStore } from '../lib/store'
import type { ConnectionConfig, Env, TestConnectionResult } from '../lib/types'
import { cn, envMeta } from '../lib/utils'
import {
  Button,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  ModalHeader,
  Segmented,
  Switch,
} from './ui'

const COLORS = ['#FF6B57', '#FBBF24', '#4ADE80', '#22D3EE', '#60A5FA', '#A78BFA', '#F472B6', '#94A3B8']

const ENV_OPTIONS: { value: Env; label: string }[] = [
  { value: 'local', label: '本地' },
  { value: 'development', label: '开发' },
  { value: 'staging', label: '预发' },
  { value: 'production', label: '生产' },
]

function blankConnection(): ConnectionConfig {
  return {
    id: '',
    name: '',
    host: '127.0.0.1',
    port: 6379,
    db: 0,
    username: '',
    tls: false,
    tlsInsecure: false,
    ssh: null,
    color: '#FF6B57',
    env: 'local',
    readOnly: false,
    hasPassword: false,
    createdAt: 0,
    lastUsedAt: 0,
  }
}

export function ConnectionModal() {
  const modal = useAppStore((s) => s.modal)
  const connections = useAppStore((s) => s.connections)
  const closeModal = useAppStore((s) => s.closeModal)
  const afterSaved = useAppStore((s) => s.afterConnectionSaved)
  const removeConnection = useAppStore((s) => s.removeConnection)

  const [draft, setDraft] = useState<ConnectionConfig>(blankConnection)
  const [password, setPassword] = useState('')
  const [clearPassword, setClearPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [tab, setTab] = useState<'basic' | 'security' | 'tunnel'>('basic')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existing = useMemo(
    () => connections.find((c) => c.id === modal.editId) ?? null,
    [connections, modal.editId],
  )

  useEffect(() => {
    if (!modal.open) return
    setDraft(existing ? { ...existing } : blankConnection())
    setPassword('')
    setClearPassword(false)
    setShowPassword(false)
    setTab('basic')
    setTestResult(null)
    setError(null)
  }, [modal.open, modal.editId]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (partial: Partial<ConnectionConfig>) => {
    setDraft((prev) => ({ ...prev, ...partial }))
    setTestResult(null)
    setError(null)
  }

  const sshEnabled = !!draft.ssh
  const env = envMeta(draft.env)

  const validate = (): string | null => {
    if (!draft.host.trim()) return '请填写 Redis 主机地址'
    if (!draft.port || draft.port < 1 || draft.port > 65535) return '端口需要在 1–65535 之间'
    if (draft.db < 0 || draft.db > 15) return '数据库编号需要在 0–15 之间'
    if (sshEnabled) {
      if (!draft.ssh?.host?.trim()) return '请填写 SSH 跳板机地址'
      if (!draft.ssh?.user?.trim()) return '请填写 SSH 用户名'
    }
    return null
  }

  const buildPayload = (): ConnectionConfig => {
    const cfg = { ...draft }
    if (!cfg.name.trim()) {
      cfg.name = `${cfg.host}:${cfg.port}`
    }
    return cfg
  }

  const test = async () => {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setTesting(true)
    setError(null)
    try {
      const result = await api.testConnection({
        connection: buildPayload(),
        password: password || undefined,
      })
      setTestResult(result)
    } catch (err) {
      setTestResult({ ok: false, latencyMs: 0, version: null, message: errorMessage(err) })
    } finally {
      setTesting(false)
    }
  }

  const save = async () => {
    const problem = validate()
    if (problem) {
      setError(problem)
      setTab(problem.includes('SSH') ? 'tunnel' : 'basic')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const cfg = await api.saveConnection({
        connection: buildPayload(),
        password: password || undefined,
        clearPassword,
      })
      toast.success(existing ? '连接已更新' : '连接已创建', {
        description: `${cfg.name} · ${cfg.host}:${cfg.port}`,
      })
      await afterSaved(cfg)
    } catch (err) {
      setError(errorMessage(err))
      toast.error('保存失败', { description: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Modal open={modal.open} onClose={closeModal} width={660}>
        <ModalHeader
          icon={existing ? Database : Plus}
          title={existing ? '编辑连接' : '新建连接'}
          description={existing ? '修改后连接会被断开，下次使用时重新建立。' : '支持单机 Redis、TLS、SSH 隧道与只读保护。'}
          onClose={closeModal}
        >
          <span
            className="mt-1 rounded-[5px] px-2 py-[2px] text-[11.5px] font-semibold uppercase tracking-[0.06em]"
            style={{ background: `${env.color}16`, color: env.color }}
          >
            {env.label}
          </span>
        </ModalHeader>

        <div className="flex items-center gap-0.5 border-b border-line/70 px-4">
          {[
            { key: 'basic' as const, label: '基础', icon: Database },
            { key: 'security' as const, label: '安全', icon: Shield },
            { key: 'tunnel' as const, label: '隧道', icon: Network },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                'relative flex h-[36px] items-center gap-1.5 px-3 text-[12.5px] font-medium transition',
                tab === item.key ? 'text-ink' : 'text-muted hover:text-ink',
              )}
            >
              <item.icon size={12} className={tab === item.key ? 'text-accent' : 'text-faint'} />
              {item.label}
              {tab === item.key ? <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent" /> : null}
            </button>
          ))}
        </div>

        <div className="scroll-area max-h-[56vh] px-5 py-4">
          {tab === 'basic' ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-[1fr_240px] gap-4">
                <Field label="连接名称" hint="用于区分不同实例">
                  <Input
                    autoFocus
                    value={draft.name}
                    onChange={(event) => patch({ name: event.target.value })}
                    placeholder="例如：订单中心 · 生产"
                  />
                </Field>
                <Field label="环境">
                  <Segmented
                    value={draft.env as Env}
                    onChange={(value) => patch({ env: value })}
                    options={ENV_OPTIONS}
                    className="w-full"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-[1fr_120px] gap-3">
                <Field label="主机地址" hint="域名或 IP">
                  <Input
                    value={draft.host}
                    onChange={(event) => patch({ host: event.target.value })}
                    placeholder="127.0.0.1"
                    className="mono"
                  />
                </Field>
                <Field label="端口">
                  <Input
                    type="number"
                    value={draft.port}
                    onChange={(event) => patch({ port: Number(event.target.value) })}
                    className="mono"
                    min={1}
                    max={65535}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="数据库 (DB)" hint="0–15">
                  <Input
                    type="number"
                    value={draft.db}
                    onChange={(event) => patch({ db: Number(event.target.value) })}
                    className="mono"
                    min={0}
                    max={15}
                  />
                </Field>
                <Field label="用户名 (ACL)" hint="可选，Redis 6+">
                  <Input
                    value={draft.username ?? ''}
                    onChange={(event) => patch({ username: event.target.value })}
                    placeholder="default"
                    className="mono"
                  />
                </Field>
              </div>

              <Field
                label="密码"
                hint={draft.hasPassword ? '已保存在钥匙串' : '将写入 macOS 钥匙串'}
              >
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setClearPassword(false)
                      setTestResult(null)
                    }}
                    placeholder={draft.hasPassword ? '••••••••（留空保持不变）' : '留空表示无密码'}
                    className="mono pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-faint hover:text-ink"
                  >
                    {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </Field>

              {draft.hasPassword && !clearPassword ? (
                <button
                  onClick={() => {
                    setClearPassword(true)
                    setPassword('')
                  }}
                  className="self-start text-[12px] text-faint underline-offset-2 hover:text-red hover:underline"
                >
                  清除已保存的密码
                </button>
              ) : null}
              {clearPassword ? (
                <p className="text-[12px] text-amber">保存后将删除钥匙串中的密码（适用于无密码实例）。</p>
              ) : null}

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted">标识颜色</span>
                <div className="flex items-center gap-2">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => patch({ color })}
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full border-2 transition',
                        draft.color === color ? 'border-ink/60 scale-105' : 'border-transparent hover:scale-105',
                      )}
                      style={{ background: color }}
                    >
                      {draft.color === color ? <Check size={12} className="text-black/70" /> : null}
                    </button>
                  ))}
                  <span className="ml-1 text-[12px] text-faint">用于侧栏和顶部标识</span>
                </div>
              </div>
            </div>
          ) : null}

          {tab === 'security' ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-[10px] border border-line bg-panel/50 p-3.5">
                <Switch
                  checked={draft.tls}
                  onChange={(value) => patch({ tls: value, tlsInsecure: value ? draft.tlsInsecure : false })}
                  label={
                    <span className="flex items-center gap-1.5">
                      <Lock size={12} className="text-cyan" /> 启用 TLS 加密
                    </span>
                  }
                  description="使用 rediss:// 连接，默认校验系统信任根证书。"
                />
                {draft.tls ? (
                  <div className="mt-3 border-t border-line/70 pt-3">
                    <Switch
                      checked={draft.tlsInsecure}
                      onChange={(value) => patch({ tlsInsecure: value })}
                      label="跳过证书校验"
                      description="仅用于自签名证书或经 SSH 隧道转发的 TLS 连接。"
                    />
                    {draft.tlsInsecure ? (
                      <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-amber">
                        <AlertTriangle size={11} className="mt-[1px] shrink-0" />
                        跳过校验会失去中间人攻击防护，请确认网络环境可信。
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="rounded-[10px] border border-line bg-panel/50 p-3.5">
                <Switch
                  checked={draft.readOnly}
                  onChange={(value) => patch({ readOnly: value })}
                  label={
                    <span className="flex items-center gap-1.5">
                      <Lock size={12} className="text-amber" /> 只读保护
                    </span>
                  }
                  description="禁止写入、删除、重命名等操作；控制台仅允许读命令。建议生产环境开启。"
                />
              </div>

              <div className="flex items-start gap-2.5 rounded-[10px] border border-line/70 bg-panel/30 p-3">
                <KeyRound size={14} className="mt-0.5 shrink-0 text-green" />
                <div>
                  <p className="text-[12.5px] font-medium text-ink">密码不会写入配置文件</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-faint">
                    密码保存在 macOS 钥匙串（服务名 com.rill.redis.connection.*），配置文件仅记录连接元数据，
                    权限为 600。Rill 不会上传任何连接信息。
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {tab === 'tunnel' ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-[10px] border border-line bg-panel/50 p-3.5">
                <Switch
                  checked={sshEnabled}
                  onChange={(value) =>
                    patch({
                      ssh: value
                        ? { host: '', port: 22, user: '', keyPath: '' }
                        : null,
                    })
                  }
                  label={
                    <span className="flex items-center gap-1.5">
                      <Network size={12} className="text-violet" /> 通过 SSH 跳板机连接
                    </span>
                  }
                  description="Rill 会启动本地 ssh -L 转发，Redis 流量不直接暴露。仅支持密钥或 ssh-agent 免密登录。"
                />
              </div>

              {sshEnabled ? (
                <>
                  <div className="grid grid-cols-[1fr_110px] gap-3">
                    <Field label="跳板机地址">
                      <Input
                        value={draft.ssh?.host ?? ''}
                        onChange={(event) =>
                          patch({ ssh: { ...draft.ssh!, host: event.target.value } })
                        }
                        placeholder="bastion.example.com"
                        className="mono"
                      />
                    </Field>
                    <Field label="SSH 端口">
                      <Input
                        type="number"
                        value={draft.ssh?.port ?? 22}
                        onChange={(event) =>
                          patch({ ssh: { ...draft.ssh!, port: Number(event.target.value) } })
                        }
                        className="mono"
                      />
                    </Field>
                  </div>
                  <Field label="SSH 用户名">
                    <Input
                      value={draft.ssh?.user ?? ''}
                      onChange={(event) =>
                        patch({ ssh: { ...draft.ssh!, user: event.target.value } })
                      }
                      placeholder="deploy"
                      className="mono"
                    />
                  </Field>
                  <Field label="私钥路径" hint="留空使用 ssh-agent / 默认密钥">
                    <Input
                      value={draft.ssh?.keyPath ?? ''}
                      onChange={(event) =>
                        patch({ ssh: { ...draft.ssh!, keyPath: event.target.value } })
                      }
                      placeholder="~/.ssh/id_ed25519"
                      className="mono"
                    />
                  </Field>
                  <div className="rounded-[9px] border border-line/70 bg-panel/30 p-3 text-[12px] leading-relaxed text-faint">
                    <p className="flex items-center gap-1.5 font-medium text-muted">
                      <Zap size={10} className="text-amber" /> 连接路径
                    </p>
                    <p className="mt-1 mono">
                      ssh {draft.ssh?.user || 'user'}@{draft.ssh?.host || 'bastion'} →{" "}
                      {draft.host}:{draft.port}
                    </p>
                    <p className="mt-1.5">
                      目标地址从跳板机一侧解析。若 Redis 只监听 127.0.0.1，请在跳板机上可直接访问该地址。
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[11px] border border-line bg-panel text-faint">
                    <Network size={18} />
                  </div>
                  <p className="text-[13px] text-muted">直连模式</p>
                  <p className="max-w-[360px] text-[12px] leading-relaxed text-faint">
                    开启后，Rill 会为这个连接创建临时 SSH 隧道，断开连接时自动关闭。
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {testResult ? (
            <div
              className={cn(
                'mt-4 flex items-start gap-2 rounded-[8px] border px-3 py-2 text-[12.5px]',
                testResult.ok
                  ? 'border-green/25 bg-green/5 text-green'
                  : 'border-red/25 bg-red/5 text-red',
              )}
            >
              {testResult.ok ? <Check size={13} className="mt-[1px]" /> : <AlertTriangle size={13} className="mt-[1px]" />}
              <div className="min-w-0">
                <span>{testResult.message}</span>
                {testResult.version ? (
                  <span className="ml-1 text-[12px] text-muted">Redis {testResult.version}</span>
                ) : null}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 flex items-center gap-1.5 text-[12.5px] text-red">
              <AlertTriangle size={12} /> {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-line/80 px-5 py-3">
          {existing ? (
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              className="text-red/80 hover:bg-red/10 hover:text-red"
              onClick={() => setDeleteOpen(true)}
            >
              删除
            </Button>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={closeModal}>
              取消
            </Button>
            <Button variant="secondary" icon={Zap} loading={testing} onClick={() => void test()}>
              测试连接
            </Button>
            <Button variant="primary" icon={existing ? Check : Plus} loading={saving} onClick={() => void save()}>
              {existing ? '保存修改' : '创建连接'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="删除这个连接？"
        description={
          <span>
            配置和钥匙串中的密码将被移除，不会影响 Redis 数据。
          </span>
        }
        confirmLabel="删除连接"
        danger
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          if (existing) {
            void removeConnection(existing.id)
            setDeleteOpen(false)
          }
        }}
      />
    </>
  )
}
