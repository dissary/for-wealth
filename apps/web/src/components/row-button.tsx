import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// A list row: its name on the left, with lines under it, and its amount on
// the right. On a phone, a row whose name and amount don't fit side by side
// puts the amount under the name, rather than shrinking either.
export const ROW = 'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 sm:flex-nowrap'
// The name and the lines under it, taking the width the amount leaves.
export const ROW_NAME = 'min-w-0 grow'
// A line under the name, such as a note. It fills the width the row has but
// doesn't widen it, so only the name and the amount decide whether the row
// fits, and a long note is cut short rather than moving the amount.
export const ROW_DETAIL = 'block contain-inline-size'

// A row that opens its record in a dialog. The hover and focus outline reach
// past the text on both sides, so the text stays in line with the list's
// edges.
export function RowButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      className={cn(
        ROW,
        '-mx-2 w-[calc(100%+1rem)] rounded-md px-2 py-3 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    />
  )
}
