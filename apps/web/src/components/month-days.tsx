import { cn } from '@/lib/utils'

// A month as a row of days: the ones gone by filled, today the brightest, the
// rest still faint. Decoration only, so whatever it sits beside says the same
// in words. It takes its colour from the text around it.
export function MonthDays({ days, today, className }: { days: number; today: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('flex gap-[3px]', className)}>
      {Array.from({ length: days }, (_, index) => {
        const day = index + 1
        return (
          <span
            key={day}
            className={cn(
              'h-2 min-w-0 flex-1 rounded-full bg-current',
              day < today && 'opacity-55',
              day > today && 'opacity-20',
            )}
          />
        )
      })}
    </div>
  )
}
