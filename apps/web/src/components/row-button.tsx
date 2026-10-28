import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// A list row that opens its record in a dialog. The hover and focus outline
// reach past the text on both sides, so the text stays in line with the
// list's edges.
export function RowButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      className={cn(
        '-mx-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-4 rounded-md px-2 py-3 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
      {...props}
    />
  )
}
