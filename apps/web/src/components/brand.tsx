import { cn } from '@/lib/utils'

// The app's mark: three ledger lines on a plum tile, as in the favicon.
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-7 shrink-0', className)}>
      <rect width="32" height="32" rx="10" className="fill-primary" />
      <g className="fill-primary-foreground">
        <rect x="8" y="9" width="16" height="3" rx="1.5" />
        <rect x="8" y="14.5" width="10" height="3" rx="1.5" />
        <rect x="8" y="20" width="13" height="3" rx="1.5" />
      </g>
    </svg>
  )
}

export function Wordmark({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn('flex items-center gap-2.5 font-heading text-lg font-semibold tracking-tight', className)}
      {...props}
    >
      <Mark />
      For Wealth
    </p>
  )
}

// What the app is for, as the page's main heading.
export function Tagline({ className, ...props }: React.ComponentProps<'h1'>) {
  return (
    <h1 className={cn('font-semibold tracking-tight', className)} {...props}>
      Know what you can spend, every day of the month.
    </h1>
  )
}
