import {
  type CalendarMonth,
  type CurrencyCode,
  categoryTrendsFigures,
  firstDayOf,
  formatAmount,
  formatNet,
  formatPeriodLabel,
  formatTrendsWindow,
  isCalendarMonth,
  monthOf,
  stepTrendsWindow,
  trendsToSchema,
} from '@for-wealth/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { FloatingAddButton } from '@/components/floating-add-button'
import { PageTitle } from '@/components/page-title'
import { EmptyPanel, PageHeading, Panel } from '@/components/panel'
import { Total } from '@/components/total'
import { TransactionDialog } from '@/components/transaction-dialog'
import { CategoryTrendsChart, TrendsChart } from '@/components/trends-chart'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '@/components/ui/native-select'
import { useToday } from '@/hooks/use-today'
import { categoriesQuery } from '@/lib/categories'
import { type CategoryTrends, type Trends, trendsQuery } from '@/lib/trends'
import { cn } from '@/lib/utils'

// The window's last month and the Category picked live in the address bar,
// so back, refresh and a bookmark return to them:
// /trends?to=2026-11&category=<id>. A value that isn't valid is dropped, and
// the router takes it out of the address bar too. Without `to` the window
// ends this month; without a Category it shows them all.
const searchSchema = z.object({
  to: z.string().refine(isCalendarMonth).optional().catch(undefined),
  category: z.uuid().optional().catch(undefined),
})

// Income and Expenses for each month of a year, and Net over the months
// shown, or one Category's totals against its Budget (v1-spec "Trends").
export const Route = createFileRoute('/_signed-in/trends')({
  validateSearch: searchSchema,
  // This month depends on today in the user's own time zone, which only the
  // signed-in layout knows. A `to` after it or before 2000 is dropped, as on
  // the Dashboard, and the window ends this month.
  beforeLoad: ({ context, search }) => {
    if (search.to && !trendsToSchema(context.me.timeZone).safeParse(search.to).success) {
      throw redirect({ to: '/trends', search: { ...search, to: undefined }, replace: true })
    }
  },
  component: TrendsPage,
})

function TrendsPage() {
  const { me } = Route.useRouteContext()
  const search = Route.useSearch()
  const today = useToday(me.timeZone)
  // This month in the user's time zone, which moves on at midnight on the
  // 1st. Without `to`, the window follows it.
  const thisMonth = monthOf(today)
  const to = search.to ?? thisMonth
  const trends = useQuery(trendsQuery(to, search.category))
  const [adding, setAdding] = useState(false)
  const add = () => setAdding(true)
  // ‹ needs the first Transaction's month, so it's off until Trends loads.
  // The previous window's answer has the same one.
  const bounds = { first: trends.data?.first ?? null, thisMonth }
  const months = trends.data?.months.map((m) => m.month) ?? []

  return (
    <main className="flex flex-col gap-5 pt-4 pb-8 sm:gap-6 sm:pt-6 sm:pb-12">
      <PageTitle>Trends</PageTitle>
      {/* The months shown sit beside the controls that change them. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <PageHeading>Trends</PageHeading>
          <nav aria-label="Years" className="flex items-center gap-3">
            {/* ‹ › joined, as one control that steps either way. */}
            <div className="flex">
              <StepLink to={stepTrendsWindow(to, -1, bounds)} direction={-1} thisMonth={thisMonth} />
              <StepLink to={stepTrendsWindow(to, 1, bounds)} direction={1} thisMonth={thisMonth} />
            </div>
            {months.length > 0 && (
              // Dimmed with the columns while the next window loads, as it
              // names the months they show.
              <p
                aria-busy={trends.isPlaceholderData}
                className={cn(
                  'text-sm font-medium tabular-nums text-muted-foreground',
                  'transition-opacity aria-busy:opacity-60',
                )}
              >
                {formatTrendsWindow(months)}
              </p>
            )}
          </nav>
        </div>
        <Button size="lg" onClick={add}>
          <PlusIcon aria-hidden="true" />
          Add Transaction
        </Button>
      </div>

      <CategoryPicker category={search.category} />

      {trends.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {trends.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p>Trends couldn't be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => trends.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {trends.data === null && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p>That Category isn't available.</p>
          <Button variant="outline" size="sm" asChild>
            <Link from={Route.fullPath} search={(prev) => ({ ...prev, category: undefined })}>
              Show All Categories
            </Link>
          </Button>
        </div>
      )}
      {trends.data &&
        (trends.data.first !== null && trends.data.months.length === 0 ? (
          // A window ending before the first Transaction, only reached from
          // the address bar, as ‹ stops at it. › steps towards it.
          <EmptyPanel>
            <p className="max-w-prose text-muted-foreground">
              Nothing recorded before {formatPeriodLabel('month', firstDayOf(trends.data.first))}.
            </p>
          </EmptyPanel>
        ) : trends.data.months.length === 0 ? (
          // A dashed outline: the space the months will fill.
          <EmptyPanel>
            <p className="max-w-prose text-muted-foreground">
              Nothing recorded yet. Once you add Transactions, each month's Income and Expenses show here side by
              side.
            </p>
            <Button variant="outline" onClick={add}>
              <PlusIcon aria-hidden="true" />
              Add Transaction
            </Button>
          </EmptyPanel>
        ) : 'category' in trends.data ? (
          <CategoryTrendsView
            trends={trends.data}
            currency={me.currency}
            thisMonth={thisMonth}
            stale={trends.isPlaceholderData}
          />
        ) : (
          <TrendsView
            trends={trends.data}
            currency={me.currency}
            thisMonth={thisMonth}
            stale={trends.isPlaceholderData}
          />
        ))}

      <FloatingAddButton onClick={add} />
      {/* Saving refreshes Trends, as its totals are summed from the
          Transactions (lib/trends). */}
      <TransactionDialog
        open={adding}
        onOpenChange={setAdding}
        currency={me.currency}
        timeZone={me.timeZone}
        defaultDate={today}
      />
    </main>
  )
}

// ‹ or ›, to the window ending with `to`, or off when it's null. Landing on
// this month drops `to` from the address, so the page goes back to following
// this month.
function StepLink({
  to,
  direction,
  thisMonth,
}: {
  to: CalendarMonth | null
  direction: -1 | 1
  thisMonth: CalendarMonth
}) {
  const label = direction === -1 ? 'Previous year' : 'Next year'
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
      <Link
        from={Route.fullPath}
        search={(prev) => ({ ...prev, to: to === thisMonth ? undefined : to })}
        aria-label={label}
      >
        <Icon aria-hidden="true" />
      </Link>
    </Button>
  )
}

// Switches the chart to one Category, over the same months. Those that
// aren't archived come first, Expense then Income, then archived ones, which
// a chart of the past still has use for. An ID the user doesn't have is
// listed too, so the picker never shows "All Categories" while one is asked
// for; the page says it isn't available.
function CategoryPicker({ category }: { category: string | undefined }) {
  const categories = useQuery(categoriesQuery)
  const navigate = Route.useNavigate()
  const data = categories.data
  const known =
    data &&
    [...data.expense, ...data.income, ...data.archived.expense, ...data.archived.income].some((c) => c.id === category)
  const archived = data ? [...data.archived.expense, ...data.archived.income] : []

  return (
    // A long Category name narrows the picker rather than widening the page.
    <div className="flex max-w-full min-w-0 items-center gap-2">
      <label htmlFor="trends-category" className="text-sm text-muted-foreground">
        Category
      </label>
      <NativeSelect
        id="trends-category"
        size="sm"
        className="min-w-0"
        value={category ?? ''}
        disabled={!data}
        onChange={(event) =>
          void navigate({ search: (prev) => ({ ...prev, category: event.target.value || undefined }) })
        }
      >
        <NativeSelectOption value="">All Categories</NativeSelectOption>
        {category && data && !known && (
          <NativeSelectOption value={category}>Unavailable Category</NativeSelectOption>
        )}
        {data && (
          <>
            <NativeSelectOptGroup label="Expense">
              {data.expense.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
            <NativeSelectOptGroup label="Income">
              {data.income.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
            {archived.length > 0 && (
              <NativeSelectOptGroup label="Archived">
                {archived.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name} (archived)
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            )}
          </>
        )}
      </NativeSelect>
    </div>
  )
}

// The heading over the figures: the months shown, which they cover.
function monthsShown(months: readonly { month: CalendarMonth }[]) {
  const from = formatPeriodLabel('month', firstDayOf(months[0]!.month))
  const to = formatPeriodLabel('month', firstDayOf(months.at(-1)!.month))
  return months.length === 1 ? from : `${from} to ${to}, ${months.length} months`
}

function TrendsView({
  trends,
  currency,
  thisMonth,
  stale,
}: {
  trends: Trends
  currency: CurrencyCode
  thisMonth: CalendarMonth
  // Still the previous window's, while the new one loads.
  stale: boolean
}) {
  const { months } = trends
  let income = 0
  let expense = 0
  for (const month of months) {
    income += month.income
    expense += month.expense
  }
  return (
    <div aria-busy={stale} className="flex flex-col gap-5 transition-opacity aria-busy:opacity-60 sm:gap-6">
      {/* The figures for the months shown, which the heading names. Two to a
          row on a phone. */}
      <Panel aria-labelledby="months-shown" className="flex flex-col gap-5">
        <h2 id="months-shown" className="font-sans text-sm font-medium text-muted-foreground">
          {monthsShown(months)}
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          <Total label="Income" amount={formatAmount(income, currency)} size="large" />
          <Total label="Expenses" amount={formatAmount(expense, currency)} size="large" />
          {/* Signed, in ink: never red or green. */}
          <Total label="Net" amount={formatNet(income - expense, currency)} size="large" />
        </dl>
      </Panel>
      <TrendsChart months={months} currency={currency} thisMonth={thisMonth} />
    </div>
  )
}

// One Category over the months shown: its total, the average a month and,
// for an Expense Category, how many budgeted months were Overspent, this
// month left out as it's still filling. No Net: one Category has nothing to
// net against (v1-spec "Trends").
function CategoryTrendsView({
  trends,
  currency,
  thisMonth,
  stale,
}: {
  trends: CategoryTrends
  currency: CurrencyCode
  thisMonth: CalendarMonth
  // Still the previous window's or Category's, while the new one loads.
  stale: boolean
}) {
  const { category, months } = trends
  const figures = categoryTrendsFigures(months, thisMonth)

  return (
    <div aria-busy={stale} className="flex flex-col gap-5 transition-opacity aria-busy:opacity-60 sm:gap-6">
      <Panel aria-labelledby="months-shown" className="flex flex-col gap-5">
        <h2 id="months-shown" className="font-sans text-sm font-medium text-muted-foreground">
          {monthsShown(months)}
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          <Total label={category.name} amount={formatAmount(figures.total, currency)} size="large" />
          <Total label="Average a month" amount={formatAmount(figures.average, currency)} size="large" />
          {category.kind === 'expense' && (
            <Total
              label="Months Overspent"
              amount={`${figures.overspent.months} of ${figures.overspent.of}`}
              detail="Months with a Budget, this month left out"
              size="large"
            />
          )}
        </dl>
      </Panel>
      <CategoryTrendsChart trends={trends} currency={currency} thisMonth={thisMonth} />
    </div>
  )
}
