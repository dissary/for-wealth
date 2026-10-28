import {
  addYears,
  budgetProgress,
  type CalendarDate,
  type CalendarMonth,
  type CurrencyCode,
  dashboardMonthSchema,
  EARLIEST_DATE,
  firstDayOf,
  formatAmount,
  formatDayLabel,
  formatPeriodLabel,
  formatShare,
  isCalendarMonth,
  monthOf,
  perDayLeft,
  stepMonth,
} from '@for-wealth/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, TargetIcon } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { BudgetsDialog } from '@/components/budgets-dialog'
import { BudgetsWarning } from '@/components/budgets-warning'
import { EstimateLabel } from '@/components/markers'
import { RowButton } from '@/components/row-button'
import { Total } from '@/components/total'
import { TransactionDialog } from '@/components/transaction-dialog'
import { Button } from '@/components/ui/button'
import { useToday } from '@/hooks/use-today'
import { type Dashboard, dashboardQuery } from '@/lib/dashboard'
import type { Transaction, View } from '@/lib/transactions'
import { cn } from '@/lib/utils'

// The month lives in the address bar, so back, refresh and a bookmark return
// to it: /?month=2026-10. One that isn't valid is dropped, and the router takes
// it out of the address bar too. Without a month it's this month.
const searchSchema = z.object({
  month: z.string().refine(isCalendarMonth).optional().catch(undefined),
})

// Home for a signed-in user: a month's plan, its Expenses by Category with
// their Budgets, what's still to come, and the Estimates to confirm.
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
  // Adding when there's no Transaction, else confirming that Estimate.
  // Closing keeps it, so the dialog doesn't turn into "Add" while it fades.
  const [dialog, setDialog] = useState<{ open: boolean; transaction?: Transaction }>({ open: false })
  const add = () => setDialog({ open: true })
  const [editingBudgets, setEditingBudgets] = useState(false)
  // The figures the Budgets warning weighs limits against, once they're the
  // month's own rather than the last month's still on screen.
  const warningFigures =
    dashboard.data && !dashboard.isPlaceholderData
      ? {
          expectedIncome: dashboard.data.plan.expectedIncome,
          commitmentsByCategory: dashboard.data.commitmentsByCategory,
        }
      : undefined

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
          today={today}
          stale={dashboard.isPlaceholderData}
          onAdd={add}
          onConfirm={(transaction) => setDialog({ open: true, transaction })}
        />
      )}

      {/* Saving refreshes the Dashboard, as its totals are summed from the
          Transactions (lib/dashboard). */}
      <TransactionDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        transaction={dialog.transaction}
        currency={me.currency}
        timeZone={me.timeZone}
        // Today, whichever month is shown (v1-spec "The Dashboard").
        defaultDate={today}
      />
      {/* The month shown, past and future ones included. */}
      <BudgetsDialog
        open={editingBudgets}
        onOpenChange={setEditingBudgets}
        month={month}
        currency={me.currency}
        warningFigures={warningFigures}
      />
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
  today,
  stale,
  onAdd,
  onConfirm,
}: {
  dashboard: Dashboard
  currency: CurrencyCode
  // In the user's time zone, so this month's per-day figures move on at
  // their midnight.
  today: CalendarDate
  // Still the previous month's, while the new one loads.
  stale: boolean
  onAdd: () => void
  onConfirm: (estimate: Transaction) => void
}) {
  const { totals, plan, budgetsOverBy, expenseCategories, upcoming, estimates } = dashboard
  // From the data, not the heading, so a stale month still names and links
  // to its own.
  const firstDay = firstDayOf(dashboard.month)
  const label = formatPeriodLabel('month', firstDay)
  // Each figure opens the Transactions behind it: this Month, filtered to a
  // row's Category, archived or not (the filter accepts both).
  const monthView: View = { period: 'month', date: firstDay }

  return (
    <div aria-busy={stale} className="flex flex-col gap-10 transition-opacity aria-busy:opacity-60 sm:gap-12">
      {/* Remaining first: what can still be spent this month. The figures it
          is worked out from sit beside it (v1-spec "Dashboard maths"). The
          labels say which is which, so no figure has a sign. */}
      <section
        aria-labelledby="remaining"
        className="grid gap-x-16 gap-y-8 border-t pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]"
      >
        <Remaining remaining={plan.remaining} currency={currency} month={dashboard.month} today={today} />
        <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-5">
          {/* The recorded part is the link: the plan figure also counts
              Income still to come, which the Transactions page doesn't show. */}
          <Total
            label="Expected Income"
            amount={formatAmount(plan.expectedIncome, currency)}
            detail={
              <Link
                to="/transactions"
                search={monthView}
                className="rounded-sm underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {formatAmount(totals.income, currency)} recorded
              </Link>
            }
          />
          <Total label="Commitments" amount={formatAmount(plan.commitments, currency)} />
          <Total label="Free to Spend" amount={formatAmount(plan.freeToSpend, currency)} />
          <Total label="Expenses" amount={formatAmount(totals.expense, currency)} view={monthView} />
        </dl>
      </section>

      {/* Expenses by Category beside what's still to come from lg up;
          stacked on smaller screens. */}
      <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="expenses-by-category" className="flex min-w-0 flex-col gap-3 border-t pt-5">
          <h2 id="expenses-by-category" className="font-heading text-xl font-semibold tracking-tight">
            Expenses by Category
          </h2>
          {budgetsOverBy !== null && <BudgetsWarning overBy={budgetsOverBy} currency={currency} />}
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
                    {budget !== null && (
                      <BudgetStanding
                        spent={total}
                        limit={budget}
                        currency={currency}
                        month={dashboard.month}
                        today={today}
                      />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-10">
          {estimates.length > 0 && (
            <EstimatesToConfirm estimates={estimates} currency={currency} onConfirm={onConfirm} />
          )}
          <Upcoming upcoming={upcoming} currency={currency} label={label} />
        </div>
      </div>
    </div>
  )
}

// The month's headline: what can still be spent, and this month, how much a
// day. Below zero it reads "Over by", in ink, as red and green are kept for
// Budgets (v1-spec "The Dashboard in slice 5").
function Remaining({
  remaining,
  currency,
  month,
  today,
}: {
  remaining: number
  currency: CurrencyCode
  month: CalendarMonth
  today: CalendarDate
}) {
  const daily = remaining > 0 ? perDayLeft(remaining, month, today) : null
  return (
    <div className="flex flex-col gap-1">
      <h2 id="remaining" className="text-sm text-muted-foreground">
        Remaining
      </h2>
      <p className="font-heading text-5xl leading-none font-semibold tracking-tight tabular-nums wrap-anywhere sm:text-6xl">
        {remaining < 0 ? `Over by ${formatAmount(-remaining, currency)}` : formatAmount(remaining, currency)}
      </p>
      {daily !== null && (
        <p className="pt-1 text-muted-foreground tabular-nums">
          {formatAmount(daily, currency)}/day for the rest of the month
        </p>
      )}
    </div>
  )
}

// Every unconfirmed Estimate, of any month, oldest first, so a forgotten one
// keeps asking. Each opens the edit dialog, where saving confirms it.
function EstimatesToConfirm({
  estimates,
  currency,
  onConfirm,
}: {
  estimates: Transaction[]
  currency: CurrencyCode
  onConfirm: (estimate: Transaction) => void
}) {
  return (
    <section aria-labelledby="estimates-to-confirm" className="flex flex-col gap-3 border-t pt-5">
      <h2 id="estimates-to-confirm" className="font-heading text-xl font-semibold tracking-tight">
        Estimates to confirm
      </h2>
      <ul aria-labelledby="estimates-to-confirm" className="divide-y">
        {estimates.map((estimate) => (
          <li key={estimate.id}>
            <RowButton onClick={() => onConfirm(estimate)}>
              <span className="min-w-0">
                <span className="block font-medium">{estimate.category.name}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {formatDayLabel(estimate.date)}
                  {estimate.note && ` · ${estimate.note}`}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="tabular-nums">{formatAmount(estimate.amount, currency, estimate.category.kind)}</span>
                <span className="text-sm font-medium text-primary">Confirm</span>
              </span>
            </RowButton>
          </li>
        ))}
      </ul>
    </section>
  )
}

// The month's Due Dates not yet created, in date order: none for a past
// month, the rest of this one, and all of a future one.
function Upcoming({
  upcoming,
  currency,
  label,
}: {
  upcoming: Dashboard['upcoming']
  currency: CurrencyCode
  label: string
}) {
  return (
    <section aria-labelledby="upcoming" className="flex flex-col gap-3 border-t pt-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="upcoming" className="font-heading text-xl font-semibold tracking-tight">
          Upcoming
        </h2>
        <Link
          to="/recurring"
          className="rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Recurring
        </Link>
      </div>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing more is due in {label}.</p>
      ) : (
        <ul aria-labelledby="upcoming" className="divide-y">
          {upcoming.map((due) => (
            <li key={`${due.recurringTransactionId}-${due.dueDate}`} className="flex items-baseline justify-between gap-4 py-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-medium">
                  {due.category.archived ? `${due.category.name} (archived)` : due.category.name}
                  {due.estimate && <EstimateLabel />}
                </span>
                <span className="block truncate text-sm text-muted-foreground">
                  {formatDayLabel(due.dueDate)}
                  {due.note && ` · ${due.note}`}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{formatAmount(due.amount, currency, due.category.kind)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// A budgeted row's bar and where it stands in words, under its name and
// amount; the limit sits under the amount spent, so the two read as one
// figure. Green while there's money left, red once Overspent, and only for
// a Budget: a row without one has no bar and no colour. This month's money
// left also reads as a daily pace, "RM35.00/day" (v1-spec "Budgets").
function BudgetStanding({
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
        {daily !== null && (
          <span className="font-normal text-muted-foreground"> · {formatAmount(daily, currency)}/day</span>
        )}
      </span>
      <span className="text-right text-sm text-muted-foreground tabular-nums">of {formatAmount(limit, currency)}</span>
    </>
  )
}
