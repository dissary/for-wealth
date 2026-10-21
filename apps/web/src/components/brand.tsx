import { cn } from '@/lib/utils'

export function Wordmark() {
  return <p className="text-sm font-medium text-primary">For Wealth</p>
}

// What the app is for, as the page's main heading.
export function Tagline({ className, ...props }: React.ComponentProps<'h1'>) {
  return (
    <h1 className={cn('font-semibold tracking-tight', className)} {...props}>
      Know what you can spend, every day of the month.
    </h1>
  )
}
