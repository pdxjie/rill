import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Loader2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn, copyText } from '../lib/utils'

export function Spinner({ className, size = 14 }: { className?: string; size?: number }) {
  return <Loader2 size={size} className={cn('animate-spin', className)} />
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet'
type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white shadow-[0_1px_0_rgba(255,255,255,.18)_inset,0_6px_18px_-8px_rgba(255,107,87,.7)] hover:brightness-110 active:brightness-95',
  secondary:
    'border border-line bg-elevated/80 text-ink hover:border-linestrong hover:bg-elevated active:bg-panel2',
  ghost: 'text-muted hover:bg-elevated hover:text-ink',
  danger: 'border border-red/25 bg-red/10 text-red hover:bg-red/15',
  quiet: 'text-muted hover:text-ink',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-[26px] gap-1.5 rounded-[7px] px-2 text-xs',
  md: 'h-[30px] gap-1.5 rounded-[8px] px-2.5 text-sm',
  lg: 'h-[36px] gap-2 rounded-[9px] px-3.5 text-base',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  loading?: boolean
}

export function Button({
  className,
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium transition-[background,color,border-color,filter,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-45',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size={size === 'sm' ? 12 : 14} /> : Icon ? <Icon size={size === 'sm' ? 13 : 15} strokeWidth={2} /> : null}
      {children}
    </button>
  )
}

export function IconButton({
  icon: Icon,
  label,
  className,
  active,
  size = 15,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon
  label: string
  active?: boolean
  size?: number
}) {
  return (
    <Tip label={label}>
      <button
        type="button"
        aria-label={label}
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-muted transition hover:bg-elevated hover:text-ink active:scale-[0.94] disabled:opacity-40',
          active && 'bg-elevated text-ink',
          className,
        )}
        {...props}
      >
        <Icon size={size} strokeWidth={1.9} />
      </button>
    </Tip>
  )
}

export function Tip({
  label,
  children,
  side = 'top',
  className,
}: {
  label: string
  children: ReactNode
  side?: 'top' | 'bottom' | 'right'
  className?: string
}) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false })

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !bubbleRef.current) return
    const trigger = triggerRef.current.getBoundingClientRect()
    const bubble = bubbleRef.current.getBoundingClientRect()
    let left = 0
    let top = 0
    if (side === 'top') {
      left = trigger.left + trigger.width / 2 - bubble.width / 2
      top = trigger.top - bubble.height - 6
    } else if (side === 'bottom') {
      left = trigger.left + trigger.width / 2 - bubble.width / 2
      top = trigger.bottom + 6
    } else {
      left = trigger.right + 6
      top = trigger.top + trigger.height / 2 - bubble.height / 2
    }
    left = Math.min(Math.max(8, left), window.innerWidth - bubble.width - 8)
    top = Math.min(Math.max(8, top), window.innerHeight - bubble.height - 8)
    setPosition({ left, top, ready: true })
  }, [open, side, label])

  useEffect(() => {
    if (open) return
    setPosition((previous) => ({ ...previous, ready: false }))
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <span
      ref={triggerRef}
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open
        ? createPortal(
            <span
              ref={bubbleRef}
              className="pointer-events-none fixed z-[200] whitespace-nowrap rounded-md border border-line bg-elevated px-1.5 py-0.5 text-[10.5px] font-medium text-ink shadow-pop"
              style={{
                left: position.left,
                top: position.top,
                visibility: position.ready ? 'visible' : 'hidden',
              }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn('field h-[30px]', className)} spellCheck={false} {...props} />
  ),
)
Input.displayName = 'Input'

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    spellCheck={false}
    className={cn('field resize-none leading-relaxed', className)}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: string
  hint?: ReactNode
  error?: string
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between text-xs font-medium text-muted">
        <span>{label}</span>
        {hint ? <span className="text-2xs font-normal text-faint">{hint}</span> : null}
      </label>
      {children}
      {error ? <span className="text-2xs text-red">{error}</span> : null}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  size = 'md',
}: {
  value: T
  options: { value: T; label: ReactNode; icon?: LucideIcon; ariaLabel?: string }[]
  onChange: (value: T) => void
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-[8px] border border-line bg-app/60 p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const Icon = option.icon
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.ariaLabel}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1 rounded-[6px] font-medium transition',
              size === 'sm' ? 'h-[22px] px-2 text-2xs' : 'h-[26px] px-2.5 text-xs',
              active
                ? 'bg-elevated text-ink shadow-[0_1px_0_rgba(255,255,255,.05)_inset,0_1px_3px_rgba(0,0,0,.25)]'
                : 'text-muted hover:text-ink',
            )}
          >
            {Icon ? <Icon size={12} /> : null}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start justify-between gap-4',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-ink">{label}</span>
        {description ? <span className="text-xs leading-relaxed text-faint">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-[20px] w-[34px] shrink-0 rounded-full border transition-colors',
          checked ? 'border-accent/40 bg-accent' : 'border-line bg-elevated',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-[17px]' : 'translate-x-[2px]',
          )}
        />
      </button>
    </label>
  )
}

export function Badge({
  children,
  color,
  tone = 'soft',
  className,
  dot,
}: {
  children: ReactNode
  color?: string
  tone?: 'soft' | 'solid' | 'outline'
  className?: string
  dot?: boolean
}) {
  const style = color
    ? tone === 'solid'
      ? { background: color, color: '#0B0C0E' }
      : tone === 'outline'
        ? { borderColor: `${color}55`, color }
        : { background: `${color}18`, color }
    : undefined
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[5px] px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-[0.04em]',
        !color && 'bg-elevated text-muted',
        tone === 'outline' && 'border bg-transparent',
        className,
      )}
      style={style}
    >
      {dot ? <span className="h-1 w-1 rounded-full" style={{ background: color ?? 'currentColor' }} /> : null}
      {children}
    </span>
  )
}

export function Modal({
  open,
  onClose,
  children,
  width = 560,
  className,
  closeOnBackdrop = true,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: number
  className?: string
  closeOnBackdrop?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    const timer = window.setTimeout(() => {
      const focusable = ref.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), textarea, select, button',
      )
      focusable?.focus()
    }, 30)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(timer)
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 animate-fade-in bg-black/55 backdrop-blur-[3px]"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 flex max-h-[86vh] w-full animate-pop-in flex-col overflow-hidden rounded-[16px] border border-line/90 bg-panel2 shadow-pop',
          className,
        )}
        style={{ maxWidth: width }}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function ModalHeader({
  title,
  description,
  icon: Icon,
  onClose,
  children,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  onClose?: () => void
  children?: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 border-b border-line/80 px-5 py-4">
      {Icon ? (
        <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-[9px] border border-line bg-elevated text-accent">
          <Icon size={16} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p> : null}
      </div>
      {children}
      {onClose ? <IconButton icon={X} label="关闭" onClick={onClose} /> : null}
    </div>
  )
}

export function CopyButton({
  value,
  className,
  label = '复制',
  size = 13,
}: {
  value: string
  className?: string
  label?: string
  size?: number
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Tip label={copied ? '已复制' : label}>
      <button
        type="button"
        onClick={async () => {
          const ok = await copyText(value)
          if (ok) {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1200)
          }
        }}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-[6px] text-faint transition hover:bg-elevated hover:text-ink',
          className,
        )}
        aria-label={label}
      >
        {copied ? <Check size={size} className="text-green" /> : <Copy size={size} />}
      </button>
    </Tip>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 p-6' : 'gap-3 p-10',
        className,
      )}
    >
      <div
        className={cn(
          'relative flex items-center justify-center rounded-[14px] border border-line bg-panel text-faint',
          compact ? 'h-9 w-9' : 'h-12 w-12',
        )}
      >
        <Icon size={compact ? 16 : 20} strokeWidth={1.7} />
        <span className="pointer-events-none absolute inset-0 rounded-[14px] glow-accent opacity-60" />
      </div>
      <div className="flex flex-col gap-1">
        <p className={cn('font-medium text-ink', compact ? 'text-sm' : 'text-base')}>{title}</p>
        {description ? (
          <p className="mx-auto max-w-[320px] text-xs leading-relaxed text-faint">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

export function Skeleton({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return <div className={cn('shimmer rounded-md', className)} style={style} />
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn('relative inline-flex', className)}>
      <select
        className="h-[26px] w-full appearance-none rounded-[7px] border border-line bg-panel pl-2 pr-6 text-xs text-ink outline-none transition hover:border-linestrong focus:border-accent/60"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-faint"
      />
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  danger,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}) {
  return (
    <Modal open={open} onClose={onCancel} width={440}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-[10px]',
              danger ? 'bg-red/10 text-red' : 'bg-accent/10 text-accent',
            )}
          >
            <CheckCircle2 size={18} />
          </span>
          <div className="flex-1">
            <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
            {description ? <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p> : null}
          </div>
        </div>
        {children}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
