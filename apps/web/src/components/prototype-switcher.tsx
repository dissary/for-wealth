// PROTOTYPE ONLY. The floating bar for flipping between a prototype's
// variants with ‹ › or the arrow keys. Never shipped: it renders nothing
// outside `vite dev`. Delete with the prototype.
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'

interface Props<K extends string> {
  variants: readonly { key: K; name: string }[]
  current: K
  onChange: (key: K) => void
  // Anything else the prototype wants in the bar, such as a data toggle.
  children?: ReactNode
}

export function PrototypeSwitcher<K extends string>({ variants, current, onChange, children }: Props<K>) {
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  )
  const step = (by: -1 | 1) => {
    const next = variants[(index + by + variants.length) % variants.length]
    if (next) onChange(next.key)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable]')) return
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!import.meta.env.DEV) return null
  const shown = variants[index]

  return (
    <div className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-foreground p-1 text-sm text-background shadow-float sm:bottom-6">
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => step(-1)}
        className="flex size-8 items-center justify-center rounded-full hover:bg-background/15"
      >
        <ChevronLeftIcon className="size-4" />
      </button>
      <span className="px-2 font-medium whitespace-nowrap tabular-nums">
        {shown?.key} · {shown?.name}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => step(1)}
        className="flex size-8 items-center justify-center rounded-full hover:bg-background/15"
      >
        <ChevronRightIcon className="size-4" />
      </button>
      {children}
    </div>
  )
}
