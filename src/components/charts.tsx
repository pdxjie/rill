import { useId, useMemo, useRef, useState } from 'react'
import { cn } from '../lib/utils'

export interface ChartPoint {
  ts: number
  value: number
}

function buildLine(points: [number, number][]): string {
  if (!points.length) return ''
  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const cur = points[i]
    const cx = (prev[0] + cur[0]) / 2
    d += ` C ${cx} ${prev[1]}, ${cx} ${cur[1]}, ${cur[0]} ${cur[1]}`
  }
  return d
}

export function Sparkline({
  data,
  color = '#FF6B57',
  height = 30,
  width = 88,
  className,
  fill = true,
}: {
  data: number[]
  color?: string
  height?: number
  width?: number
  className?: string
  fill?: boolean
}) {
  const id = useId().replace(/:/g, '')
  if (!data.length) {
    return (
      <div
        className={cn('rounded bg-line/15', className)}
        style={{ height, width }}
      />
    )
  }
  const series = data.length === 1 ? [data[0], data[0]] : data
  const min = Math.min(...series)
  const max = Math.max(...series)
  const range = max - min || 1
  const pts: [number, number][] = series.map((value, i) => [
    (i / (series.length - 1)) * width,
    max === min
      ? height / 2
      : height - 3 - ((value - min) / range) * (height - 6),
  ])
  const line = buildLine(pts)
  const area = `${line} L ${width} ${height} L 0 ${height} Z`
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill ? <path d={area} fill={`url(#spark-${id})`} /> : null}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function AreaChart({
  data,
  color = '#FF6B57',
  height = 196,
  formatValue = (n) => String(n),
  formatTime = (ts) => new Date(ts).toLocaleTimeString('en-GB', { hour12: false }),
  className,
}: {
  data: ChartPoint[]
  color?: string
  height?: number
  formatValue?: (value: number) => string
  formatTime?: (ts: number) => string
  className?: string
}) {
  const id = useId().replace(/:/g, '')
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const geometry = useMemo(() => {
    const width = 800
    const padY = 12
    if (data.length < 2) return null
    const values = data.map((d) => d.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    const pts: [number, number][] = data.map((d, i) => [
      (i / (data.length - 1)) * width,
      height - padY - ((d.value - min) / span) * (height - padY * 2),
    ])
    const line = buildLine(pts)
    const area = `${line} L ${width} ${height} L 0 ${height} Z`
    return { width, min, max, span, pts, line, area }
  }, [data, height])

  if (!geometry) {
    return (
      <div className={cn('flex items-center justify-center rounded-lg border border-dashed border-line text-2xs text-faint', className)} style={{ height }}>
        正在收集指标…
      </div>
    )
  }

  const hoverPoint = hover !== null ? data[hover] : null
  const hoverX = hover !== null ? geometry.pts[hover][0] : 0
  const hoverY = hover !== null ? geometry.pts[hover][1] : 0

  return (
    <div
      ref={wrapRef}
      className={cn('relative select-none', className)}
      style={{ height }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const ratio = (event.clientX - rect.left) / rect.width
        setHover(Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1)))))
      }}
    >
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 800 ${height}`}
        preserveAspectRatio="none"
        className="overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.26" />
            <stop offset="55%" stopColor={color} stopOpacity="0.08" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.15, 0.4, 0.65, 0.9].map((ratio) => (
          <line
            key={ratio}
            x1="0"
            x2="800"
            y1={height * ratio}
            y2={height * ratio}
            stroke="rgb(var(--line) / 0.55)"
            strokeWidth="1"
            strokeDasharray="3 5"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={geometry.area} fill={`url(#area-${id})`} />
        <path
          d={geometry.line}
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {hover !== null ? (
          <>
            <line
              x1={hoverX}
              x2={hoverX}
              y1="0"
              y2={height}
              stroke={color}
              strokeOpacity="0.35"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={hoverX} cy={hoverY} r="3.2" fill={color} stroke="rgb(var(--panel2))" strokeWidth="2" />
          </>
        ) : null}
      </svg>
      {hoverPoint ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-line bg-elevated px-2 py-1 text-2xs shadow-pop"
          style={{ left: `${(hover! / (data.length - 1)) * 100}%`, top: 0 }}
        >
          <div className="font-semibold tabular-nums text-ink">{formatValue(hoverPoint.value)}</div>
          <div className="text-faint">{formatTime(hoverPoint.ts)}</div>
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-1 pb-0.5 text-[11.5px] text-faint">
        <span>{formatTime(data[0].ts)}</span>
        <span>{formatTime(data[data.length - 1].ts)}</span>
      </div>
    </div>
  )
}

export function Ring({
  value,
  size = 54,
  width = 5,
  color = '#4ADE80',
  track = 'rgb(var(--line) / 0.65)',
  children,
}: {
  value: number
  size?: number
  width?: number
  color?: string
  track?: string
  children?: React.ReactNode
}) {
  const radius = (size - width) / 2
  const circumference = 2 * Math.PI * radius
  const pct = Math.max(0, Math.min(1, value))
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={track} strokeWidth={width} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.9,.25,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}

export function BarRow({
  label,
  value,
  max,
  hint,
  color = 'rgb(var(--accent))',
  mono,
}: {
  label: string
  value: number
  max: number
  hint?: React.ReactNode
  color?: string
  mono?: boolean
}) {
  const pct = max > 0 ? Math.max(1.5, (value / max) * 100) : 0
  return (
    <div className="group flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className={cn('min-w-0 truncate text-xs text-ink', mono && 'mono')}>{label}</span>
        <span className="shrink-0 text-2xs tabular-nums text-muted">{hint}</span>
      </div>
      <div className="h-[3px] overflow-hidden rounded-full bg-line/50">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}
