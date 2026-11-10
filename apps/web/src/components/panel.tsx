import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// The surface a page's content sits on: a step lighter than the page, with
// soft corners and a faint shadow, so each group of figures or rows reads as
// one thing. The padding is the panel's own, so rows inside can run their
// hover outline towards its edges.
export const PANEL = 'rounded-2xl bg-card p-5 text-card-foreground shadow-panel sm:p-6'

// A page's panel, as a <section>: give it aria-labelledby and a heading.
export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn(PANEL, className)} {...props} />
}

// A panel's heading.
export function PanelTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('text-lg font-semibold tracking-tight', className)} {...props} />
}

// A page's heading: the month on the Dashboard, the Period on Transactions.
export function PageHeading({ className, ...props }: ComponentProps<'h1'>) {
  return <h1 className={cn('text-3xl font-semibold tracking-tight sm:text-4xl', className)} {...props} />
}

// A page with nothing to list yet: what will show here, and the button that
// starts it.
export function EmptyPanel({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-4 rounded-2xl border border-dashed border-input px-5 py-8 sm:px-6',
        className,
      )}
      {...props}
    />
  )
}
