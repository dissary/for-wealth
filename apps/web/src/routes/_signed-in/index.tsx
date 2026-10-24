import {
  type CurrencyCode,
  firstDayOf,
  formatAmount,
  formatPeriodLabel,
  formatShare,
  monthOf,
} from '@for-wealth/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Total } from '@/components/total'
import { Button } from '@/components/ui/button'
import { useToday } from '@/hooks/use-today'
import { type Dashboard, dashboardQuery } from '@/lib/dashboard'

// Home for a signed-in user: this month's totals and Expenses by Category.
export const Route = createFileRoute('/_signed-in/')({
  component: DashboardPage,
})

function DashboardPage() {
  const { me } = Route.useRouteContext()
  // This month in the user's time zone, which moves on at midnight on the 1st.
  const month = monthOf(useToday(me.timeZone))
  const dashboard = useQuery(dashboardQuery(month))
  const label = formatPeriodLabel('month', firstDayOf(month))

  return (
    <main className="flex flex-col gap-6 py-8 sm:py-12">
      <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">{label}</h1>

      {dashboard.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {dashboard.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p>The Dashboard couldn't be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => dashboard.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {dashboard.data && <MonthView dashboard={dashboard.data} label={label} currency={me.currency} />}
    </main>
  )
}

function MonthView({ dashboard, label, currency }: { dashboard: Dashboard; label: string; currency: CurrencyCode }) {
  const { totals, expenseCategories } = dashboard

  return (
    <div className="flex flex-col gap-6">
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
