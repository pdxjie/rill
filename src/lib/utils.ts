import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { RedisType } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  const fixed = i === 0 ? value.toFixed(0) : value.toFixed(value >= 100 ? 0 : digits)
  return `${fixed} ${units[i]}`
}

export function formatNumber(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(digits)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(digits)}M`
  if (abs >= 1e4) return `${(n / 1e3).toFixed(digits)}k`
  return new Intl.NumberFormat('en-US').format(n)
}

export function formatInt(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n || 0))
}

export function formatPercent(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return '0%'
  return `${(ratio * 100).toFixed(digits)}%`
}

export function formatTtl(seconds: number): string {
  if (seconds === -1) return '永久'
  if (seconds === -2) return '已过期'
  if (seconds < 0) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return s ? `${m}m ${s}s` : `${m}m`
  }
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return m ? `${h}h ${m}m` : `${h}h`
  }
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  return h ? `${d}d ${h}h` : `${d}d`
}

export function formatDurationUs(us: number): string {
  if (us < 1000) return `${us} µs`
  if (us < 1_000_000) return `${(us / 1000).toFixed(2)} ms`
  return `${(us / 1_000_000).toFixed(2)} s`
}

export function formatUptime(secs: number): string {
  if (!secs) return '—'
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return `${d} 天 ${h} 小时`
  if (h > 0) return `${h} 小时 ${m} 分`
  return `${m} 分钟`
}

export function timeAgo(tsMs: number): string {
  if (!tsMs) return '—'
  const diff = Date.now() - tsMs
  if (diff < 5_000) return '刚刚'
  if (diff < 60_000) return `${Math.floor(diff / 1000)} 秒前`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}

export function timeAgoSeconds(tsSec: number): string {
  return timeAgo(tsSec * 1000)
}

export function formatClock(tsMs: number): string {
  const d = new Date(tsMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatDateTime(tsMs: number): string {
  const d = new Date(tsMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const ENV_META: Record<string, { label: string; color: string }> = {
  production: { label: 'PROD', color: '#F87171' },
  staging: { label: 'STAGE', color: '#FBBF24' },
  development: { label: 'DEV', color: '#60A5FA' },
  local: { label: 'LOCAL', color: '#4ADE80' },
}

export function envMeta(env: string) {
  return ENV_META[env] ?? { label: env?.toUpperCase() || 'ENV', color: '#94A3B8' }
}

export const TYPE_META: Record<string, { label: string; color: string; short: string }> = {
  string: { label: 'String', color: '#7DD3FC', short: 'STR' },
  hash: { label: 'Hash', color: '#A78BFA', short: 'HASH' },
  list: { label: 'List', color: '#FBBF24', short: 'LIST' },
  set: { label: 'Set', color: '#F472B6', short: 'SET' },
  zset: { label: 'Sorted Set', color: '#34D399', short: 'ZSET' },
  stream: { label: 'Stream', color: '#22D3EE', short: 'STM' },
  none: { label: 'None', color: '#94A3B8', short: '—' },
}

export function typeMeta(type: RedisType | string) {
  return TYPE_META[type] ?? { label: type || 'Unknown', color: '#94A3B8', short: '?' }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const JSON_TOKEN =
  /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g

export function jsonToHtml(text: string): string {
  let html = ''
  let last = 0
  for (const match of text.matchAll(JSON_TOKEN)) {
    const index = match.index ?? 0
    html += escapeHtml(text.slice(last, index))
    const token = match[0]
    let cls = 'hl-number'
    if (token.startsWith('"')) {
      cls = token.trimEnd().endsWith(':') ? 'hl-key' : 'hl-string'
    } else if (token === 'true' || token === 'false') {
      cls = 'hl-bool'
    } else if (token === 'null') {
      cls = 'hl-null'
    }
    html += `<span class="${cls}">${escapeHtml(token)}</span>`
    last = index + token.length
  }
  html += escapeHtml(text.slice(last))
  return html
}

export function tryPrettyJson(text: string): { ok: boolean; text: string; compact?: string } {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, text }
  if (!/^[[{]/.test(trimmed)) return { ok: false, text }
  try {
    const parsed = JSON.parse(trimmed)
    return {
      ok: true,
      text: JSON.stringify(parsed, null, 2),
      compact: JSON.stringify(parsed),
    }
  } catch {
    return { ok: false, text }
  }
}

export function isProbablyJson(text: string): boolean {
  const trimmed = text.trim()
  return /^[[{]/.test(trimmed) && tryPrettyJson(trimmed).ok
}

export function splitKey(key: string): string[] {
  return key.split(':').filter(Boolean)
}

export function keyPrefix(key: string): string {
  const idx = key.indexOf(':')
  return idx > 0 ? key.slice(0, idx) : key
}

export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const q = query.trim()
  if (!q || q === '*') return [{ text, hit: false }]
  const escaped = q.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  try {
    const re = new RegExp(`(${escaped})`, 'ig')
    const parts: { text: string; hit: boolean }[] = []
    let last = 0
    for (const m of text.matchAll(re)) {
      const index = m.index ?? 0
      if (index > last) parts.push({ text: text.slice(last, index), hit: false })
      parts.push({ text: m[0], hit: true })
      last = index + m[0].length
    }
    if (last < text.length) parts.push({ text: text.slice(last), hit: false })
    return parts.length ? parts : [{ text, hit: false }]
  } catch {
    return [{ text, hit: false }]
  }
}

/** Case-insensitive substring match, with a subsequence fallback (e.g. "upr" → "user:profile"). */
export function fuzzyMatch(text: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = text.toLowerCase()
  if (haystack.includes(q)) return true
  let index = 0
  for (const char of haystack) {
    if (char === q[index]) {
      index++
      if (index === q.length) return true
    }
  }
  return false
}

export function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}

export function truncate(text: string, max = 120): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

export function truncateMiddle(text: string, max = 42): string {
  if (text.length <= max) return text
  const half = Math.floor((max - 1) / 2)
  return `${text.slice(0, half)}…${text.slice(-half)}`
}

export async function copyText(text: string): Promise<boolean> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('copy_to_clipboard', { text })
      return true
    } catch {
      // fall through to the web clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      return true
    } catch {
      return false
    }
  }
}

export function normalizePattern(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return '*'
  if (trimmed.includes('*') || trimmed.includes('?')) return trimmed
  return `*${trimmed}*`
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
