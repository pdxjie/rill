export function Logo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect x="2" y="4" width="16" height="4.4" rx="2.2" fill="currentColor" />
      <rect x="2" y="10.4" width="12" height="4.4" rx="2.2" fill="currentColor" opacity="0.72" />
      <rect x="2" y="16.8" width="8" height="4.4" rx="2.2" fill="currentColor" opacity="0.45" />
      <circle cx="20.4" cy="6.2" r="2.1" fill="currentColor" />
    </svg>
  )
}

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <div
      className="relative flex items-center justify-center rounded-[10px] border border-line bg-panel text-accent shadow-card"
      style={{ width: size, height: size }}
    >
      <Logo size={size * 0.6} />
      <span className="pointer-events-none absolute inset-0 rounded-[10px] bg-accent/5" />
    </div>
  )
}
