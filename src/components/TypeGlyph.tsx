import {
  Activity,
  BarChart3,
  Circle,
  Hash,
  Layers,
  List,
  Type,
  type LucideIcon,
} from 'lucide-react'
import { cn, typeMeta } from '../lib/utils'
import type { RedisType } from '../lib/types'

const ICONS: Record<string, LucideIcon> = {
  string: Type,
  hash: Hash,
  list: List,
  set: Layers,
  zset: BarChart3,
  stream: Activity,
  none: Circle,
}

export function TypeGlyph({
  type,
  size = 22,
  className,
  iconSize,
}: {
  type: RedisType | string
  size?: number
  className?: string
  iconSize?: number
}) {
  const meta = typeMeta(type)
  const Icon = ICONS[type] ?? Circle
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-[6px]', className)}
      style={{
        width: size,
        height: size,
        background: `${meta.color}16`,
        color: meta.color,
      }}
    >
      <Icon size={iconSize ?? Math.round(size * 0.55)} strokeWidth={2.1} />
    </span>
  )
}

export function TypeBadge({ type }: { type: RedisType | string }) {
  const meta = typeMeta(type)
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-[1px] text-[10px] font-semibold"
      style={{ background: `${meta.color}16`, color: meta.color }}
    >
      <span className="h-1 w-1 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  )
}
