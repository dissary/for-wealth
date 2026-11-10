import { budgetProgress, type CalendarDate, type CalendarMonth, type CurrencyCode, formatAmount, perDayLeft } from '@for-wealth/shared'
import { cn } from '@/lib/utils'

// A Budget's bar and where it stands in words, on the Dashboard's budgeted
// rows and the Transactions page's Budget strip, so both look and count the
// same. It fills two columns of the grid it sits in: the bar spans both, the
// words take the first and the limit the second, under the amount spent, so
// the two read as one figure. Green while there's money left, red once
// Overspent, and only for a Budget: a row without one has no bar and no
// colour. This month's money left also reads as a daily pace, "RM35.00/day"
// (v1-spec "Budgets").
export function BudgetStanding({
  spent,
  limit,
  currency,
  month,
  today,
}: {
  spent: number
  limit: number
  currency: CurrencyCode
  month: CalendarMonth
  today: CalendarDate
}) {
  const progress = budgetProgress(spent, limit)
  const daily = progress.overspent ? null : perDayLeft(progress.left, month, today)
  return (
    <>
      {/* The words say what the bar shows, so screen readers skip it. */}
      <div aria-hidden="true" className="col-span-2 col-start-1 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', progress.overspent ? 'bg-over-budget' : 'bg-under-budget')}
          style={{ width: `${progress.fill * 100}%` }}
        />
      </div>
      <span
        className={cn(
          'col-start-1 text-sm font-medium tabular-nums',
          progress.overspent ? 'text-over-budget' : 'text-under-budget',
        )}
      >
        {progress.overspent
          ? `Overspent by ${formatAmount(progress.by, currency)}`
          : `${formatAmount(progress.left, currency)} left`}
        {daily !== null && (
          <span className="font-normal text-muted-foreground"> · {formatAmount(daily, currency)}/day</span>
        )}
      </span>
      <span className="text-right text-sm text-muted-foreground tabular-nums">of {formatAmount(limit, currency)}</span>
    </>
  )
}
