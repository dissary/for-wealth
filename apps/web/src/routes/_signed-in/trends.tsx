import { type CalendarMonth, type CurrencyCode, firstDayOf, formatAmount, formatNet, formatPeriodLabel, monthOf } from '@for-wealth/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { FloatingAddButton } from '@/components/floating-add-button'
import { PageTitle } from '@/components/page-title'
import { EmptyPanel, PageHeading, Panel } from '@/components/panel'
import { Total } from '@/components/total'
import { TransactionDialog } from '@/components/transaction-dialog'
import { TrendsChart } from '@/components/trends-chart'
import { Button } from '@/components/ui/button'
import { useToday } from '@/hooks/use-today'
import { type Trends, trendsQuery } from '@/lib/trends'

// Income and Expenses for each month of the last year, and Net over the
// months shown (v1-spec "Trends").
export const Route = createFileRoute('/_signed-in/trends')({
  component: TrendsPage,
})

function TrendsPage() {
  const { me } = Route.useRouteContext()
  const today = useToday(me.timeZone)
  // The year ending this month in the user's time zone, which moves on at
  // midnight on the 1st.
  const thisMonth = monthOf(today)
  const trends = useQuery(trendsQuery(thisMonth))
  const [adding, setAdding] = useState(false)
  const add = () => setAdding(true)

  return (
    <main className="flex flex-col gap-5 pt-4 pb-8 sm:gap-6 sm:pt-6 sm:pb-12">
      <PageTitle>Trends</PageTitle>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <PageHeading>Trends</PageHeading>
        <Button size="lg" onClick={add}>
          <PlusIcon aria-hidden="true" />
          Add Transaction
        </Button>
      </div>

      {trends.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {trends.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p>Trends couldn't be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => trends.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {trends.data &&
        (trends.data.months.length === 0 ? (
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
  const from = formatPeriodLabel('month', firstDayOf(months[0]!.month))
  const to = formatPeriodLabel('month', firstDayOf(months.at(-1)!.month))

  return (
    <div aria-busy={stale} className="flex flex-col gap-5 transition-opacity aria-busy:opacity-60 sm:gap-6">
      {/* The figures for the months shown, which the heading names. Two to a
          row on a phone. */}
      <Panel aria-labelledby="months-shown" className="flex flex-col gap-5">
        <h2 id="months-shown" className="font-sans text-sm font-medium text-muted-foreground">
          {months.length === 1 ? from : `${from} to ${to}`}
          {months.length > 1 && `, ${months.length} months`}
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
