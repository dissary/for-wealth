import {
  addYears,
  budgetProgress,
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
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, TargetIcon } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { BudgetsDialog } from '@/components/budgets-dialog'
import { Total } from '@/components/total'
import { TransactionDialog } from '@/components/transaction-dialog'
import { Button } from '@/components/ui/button'
import { useToday } from '@/hooks/use-today'
import { type Dashboard, dashboardQuery } from '@/lib/dashboard'
import type { View } from '@/lib/transactions'
import { cn } from '@/lib/utils'

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
  const [adding, setAdding] = useState(false)
  const add = () => setAdding(true)
  const [editingBudgets, setEditingBudgets] = useState(false)

  return (
    <main className="flex flex-col gap-8 py-8 sm:gap-10 sm:py-12">
      {/* The month is the page, so it's set large, in the narrow heading cut,
          like the tagline on the sign-in page. */}
      <div className="flex flex-col gap-5">
        <h1 className="font-heading text-5xl leading-[0.95] font-semibold tracking-tight sm:text-6xl lg:text-7xl">
          {label}
        </h1>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Months" className="flex items-center gap-2">
            {/* ‹ › joined, as one control that steps either way. */}
            <div className="flex">
              <StepLink to={stepMonth(month, -1, bounds)} direction={-1} />
              <StepLink to={stepMonth(month, 1, bounds)} direction={1} />
            </div>
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
          {/* Always shown, so Budgets can be set before a month has any
              Expenses. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg" variant="outline" onClick={() => setEditingBudgets(true)}>
              <TargetIcon aria-hidden="true" />
              Edit Budgets
            </Button>
            <Button size="lg" onClick={add}>
              <PlusIcon aria-hidden="true" />
              Add Transaction
            </Button>
          </div>
        </div>
      </div>

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
        <MonthView
          dashboard={dashboard.data}
          currency={me.currency}
          stale={dashboard.isPlaceholderData}
          onAdd={add}
        />
      )}

      {/* Saving refreshes the Dashboard, as its totals are summed from the
          Transactions (lib/dashboard). */}
      <TransactionDialog
        open={adding}
        onOpenChange={setAdding}
        currency={me.currency}
        timeZone={me.timeZone}
        // Today, whichever month is shown (v1-spec "The Dashboard").
        defaultDate={today}
      />
      {/* The month shown, past and future ones included. */}
      <BudgetsDialog open={editingBudgets} onOpenChange={setEditingBudgets} month={month} currency={me.currency} />
    </main>
  )
}

// ‹ or ›, which stop at the months holding the bounds of a Transaction's date,
// as on the Transactions page.
function StepLink({ to, direction }: { to: CalendarMonth | null; direction: -1 | 1 }) {
  const label = direction === -1 ? 'Previous month' : 'Next month'
  const Icon = direction === -1 ? ChevronLeftIcon : ChevronRightIcon
  // The pair shares one border between them; a focused one sits on top, so
  // its ring isn't hidden by the other.
  const joined = cn('focus-visible:z-10', direction === -1 ? 'rounded-r-none' : '-ml-px rounded-l-none')
  if (!to) {
    return (
      <Button variant="outline" size="icon" aria-label={label} disabled className={joined}>
        <Icon aria-hidden="true" />
      </Button>
    )
  }
  return (
    <Button variant="outline" size="icon" asChild className={joined}>
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
  onAdd,
}: {
  dashboard: Dashboard
  currency: CurrencyCode
  // Still the previous month's, while the new one loads.
  stale: boolean
  onAdd: () => void
}) {
  const { totals, expenseCategories } = dashboard
  // From the data, not the heading, so a stale month still names and links
  // to its own.
  const firstDay = firstDayOf(dashboard.month)
  const label = formatPeriodLabel('month', firstDay)
  // Each figure opens the Transactions behind it: this Month, filtered to a
  // row's Category, archived or not (the filter accepts both).
  const monthView: View = { period: 'month', date: firstDay }

  return (
    // Totals beside Expenses by Category from lg up, each column under its
    // own rule; stacked on smaller screens, with the two totals side by side.
    <div
      aria-busy={stale}
      className="grid gap-x-16 gap-y-10 transition-opacity aria-busy:opacity-60 lg:grid-cols-[15rem_minmax(0,1fr)]"
    >
      {/* No net figure, Free to Spend or Remaining until slice 5 (v1-spec
          "The Dashboard"). The labels say which is which, so neither total
          has a sign. */}
      <dl className="grid grid-cols-2 content-start gap-6 border-t pt-5 lg:grid-cols-1 lg:gap-8">
        <Total label="Income" amount={formatAmount(totals.income, currency)} view={monthView} size="large" />
        <Total label="Expenses" amount={formatAmount(totals.expense, currency)} view={monthView} size="large" />
      </dl>

      <section aria-labelledby="expenses-by-category" className="flex min-w-0 flex-col gap-3 border-t pt-5">
        <h2 id="expenses-by-category" className="font-heading text-xl font-semibold tracking-tight">
          Expenses by Category
        </h2>
        {expenseCategories.length === 0 ? (
          // A dashed outline: the space the month's Expenses will fill.
          <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed px-6 py-10">
            <p className="text-muted-foreground">No Expenses in {label}.</p>
            <Button variant="outline" onClick={onAdd}>
              <PlusIcon aria-hidden="true" />
              Add a Transaction
            </Button>
          </div>
        ) : (
          // Already in display order: largest total first, then budgeted
          // Categories with nothing spent. Columns are shared through
          // subgrid, so every row's amount, limit and share line up.
          <ul aria-labelledby="expenses-by-category" className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 divide-y">
            {expenseCategories.map(({ category, total, budget }) => (
              <li key={category.id} className="col-span-full grid grid-cols-subgrid">
                {/* The hover and focus outline reach past the text on both
                    sides, so the text stays in line with the heading. */}
                <Link
                  to="/transactions"
                  search={{ ...monthView, category: category.id }}
                  className="relative isolate col-span-full grid grid-cols-subgrid items-baseline gap-y-2 py-3.5 outline-none before:absolute before:inset-y-0 before:-inset-x-2 before:-z-10 before:rounded-md before:transition-colors hover:before:bg-muted focus-visible:before:ring-3 focus-visible:before:ring-ring/50"
                >
                  <span className="min-w-0 font-medium">
                    {category.archived ? `${category.name} (archived)` : category.name}
                  </span>
                  <span className="text-right font-medium tabular-nums">{formatAmount(total, currency)}</span>
                  {/* A budgeted Category with nothing spent has no share. */}
                  <span className="w-10 text-right text-sm text-muted-foreground tabular-nums">
                    {total > 0 && formatShare(total, totals.expense)}
                  </span>
                  {budget !== null && <BudgetStanding spent={total} limit={budget} currency={currency} />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// A budgeted row's bar and where it stands in words, under its name and
// amount; the limit sits under the amount spent, so the two read as one
// figure. Green while there's money left, red once Overspent, and only for
// a Budget: a row without one has no bar and no colour (v1-spec "Budgets").
function BudgetStanding({ spent, limit, currency }: { spent: number; limit: number; currency: CurrencyCode }) {
  const progress = budgetProgress(spent, limit)
  return (
    <>
      {/* The words say what the bar shows, so screen readers skip it. */}
      <div aria-hidden="true" className="col-span-2 col-start-1 h-1.5 overflow-hidden rounded-full bg-border">
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
      </span>
      <span className="text-right text-sm text-muted-foreground tabular-nums">of {formatAmount(limit, currency)}</span>
    </>
  )
}
