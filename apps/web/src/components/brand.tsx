import { cn } from '@/lib/utils'

export function Wordmark({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p className={cn('text-sm font-medium text-primary', className)} {...props}>
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
