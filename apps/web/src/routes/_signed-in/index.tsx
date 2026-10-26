import {
  addYears,
  type CalendarMonth,
  type CurrencyCode,
  dashboardMonthSchema,
  EARLIEST_DATE,
  firstDayOf,
  formatAmount,
  formatPeriodLabel,
  formatShare,
  isCalendarMonth,
  monthOf,
  stepMonth,
} from '@for-wealth/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { z } from 'zod'
import { Total } from '@/components/total'
import { Button } from '@/components/ui/button'
import { useToday } from '@/hooks/use-today'
import { type Dashboard, dashboardQuery } from '@/lib/dashboard'

// The month lives in the address bar, so back, refresh and a bookmark return
// to it: /?month=2026-10. One that isn't valid is dropped, and the router takes
// it out of the address bar too. Without a month it's this month.
const searchSchema = z.object({
  month: z.string().refine(isCalendarMonth).optional().catch(undefined),
})

// Home for a signed-in user: a month's totals and Expenses by Category.
export const Route = createFileRoute('/_signed-in/')({
  validateSearch: searchSchema,
  // The month's bounds depend on today in the user's own time zone, which
  // only the signed-in layout knows. One outside them falls back to this month.
  beforeLoad: ({ context, search }) => {
    if (search.month && !dashboardMonthSchema(context.me.timeZone).safeParse(search.month).success) {
      throw redirect({ to: '/', search: { ...search, month: undefined }, replace: true })
    }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const { me } = Route.useRouteContext()
  const search = Route.useSearch()
  const today = useToday(me.timeZone)
  // This month in the user's time zone, which moves on at midnight on the 1st.
  const thisMonth = monthOf(today)
  const month = search.month ?? thisMonth
  const dashboard = useQuery(dashboardQuery(month))
  const label = formatPeriodLabel('month', firstDayOf(month))
  const bounds = { earliest: EARLIEST_DATE, latest: addYears(today, 1) }

  return (
    <main className="flex flex-col gap-6 py-8 sm:py-12">
      <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">{label}</h1>

      <nav aria-label="Months" className="flex items-center gap-1">
        <StepLink to={stepMonth(month, -1, bounds)} direction={-1} />
        <StepLink to={stepMonth(month, 1, bounds)} direction={1} />
        {month === thisMonth ? (
          <Button variant="outline" disabled>
            This month
          </Button>
        ) : (
          <Button variant="outline" asChild>
            <Link from={Route.fullPath} search={(prev) => ({ ...prev, month: undefined })}>
              This month
            </Link>
          </Button>
        )}
      </nav>

      {dashboard.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {dashboard.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p>The Dashboard couldn't be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => dashboard.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {dashboard.data && (
        <MonthView dashboard={dashboard.data} currency={me.currency} stale={dashboard.isPlaceholderData} />
      )}
    </main>
  )
}

// ‹ or ›, which stop at the months holding the bounds of a Transaction's date,
// as on the Transactions page.
function StepLink({ to, direction }: { to: CalendarMonth | null; direction: -1 | 1 }) {
  const label = direction === -1 ? 'Previous month' : 'Next month'
  const Icon = direction === -1 ? ChevronLeftIcon : ChevronRightIcon
  if (!to) {
    return (
      <Button variant="outline" size="icon" aria-label={label} disabled>
        <Icon aria-hidden="true" />
      </Button>
    )
  }
  return (
    <Button variant="outline" size="icon" asChild>
      <Link from={Route.fullPath} search={(prev) => ({ ...prev, month: to })} aria-label={label}>
        <Icon aria-hidden="true" />
      </Link>
    </Button>
  )
}

function MonthView({
  dashboard,
  currency,
  stale,
}: {
  dashboard: Dashboard
  currency: CurrencyCode
  // Still the previous month's, while the new one loads.
  stale: boolean
}) {
  const { totals, expenseCategories } = dashboard
  // From the data, not the heading, so a stale month still names its own.
  const label = formatPeriodLabel('month', firstDayOf(dashboard.month))

  return (
    <div aria-busy={stale} className="flex flex-col gap-6 transition-opacity aria-busy:opacity-60">
      {/* No net figure, Free to Spend or Remaining until slice 5 (v1-spec
          "The Dashboard"). The labels say which is which, so neither total
          has a sign. */}
      <dl className="flex gap-10">
        <Total label="Income" amount={formatAmount(totals.income, currency)} />
        <Total label="Expenses" amount={formatAmount(totals.expense, currency)} />
      </dl>

      <section aria-labelledby="expenses-by-category" className="flex flex-col gap-2">
        <h2 id="expenses-by-category" className="text-sm font-medium text-muted-foreground">
          Expenses by Category
        </h2>
        {expenseCategories.length === 0 ? (
          <p className="border-t pt-6 text-muted-foreground">No Expenses in {label}.</p>
        ) : (
          // Already in display order: largest total first. No bars until
          // slice 4, where a bar always means Budget progress.
          <ul aria-labelledby="expenses-by-category" className="divide-y border-t">
            {expenseCategories.map(({ category, total }) => (
              <li key={category.id} className="flex items-baseline justify-between gap-4 py-3">
                <span className="min-w-0 font-medium">
                  {category.archived ? `${category.name} (archived)` : category.name}
                </span>
                <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
                  <span>{formatAmount(total, currency)}</span>
                  <span className="w-10 text-right text-sm text-muted-foreground">
                    {formatShare(total, totals.expense)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
