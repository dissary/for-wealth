import { type CurrencyCode, formatAmount, formatDayLabel, todayIn } from '@for-wealth/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AddTransactionDialog } from '@/components/add-transaction-dialog'
import { Button } from '@/components/ui/button'
import { type Day, dayQuery } from '@/lib/transactions'

export const Route = createFileRoute('/_signed-in/transactions')({
  component: TransactionsPage,
})

// Today as a Day, taken in the user's own time zone, not the device's.
function TransactionsPage() {
  const { me } = Route.useRouteContext()
  const date = useToday(me.timeZone)
  const day = useQuery(dayQuery(date))
  const [adding, setAdding] = useState(false)

  return (
    <main className="flex flex-col gap-8 py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          {formatDayLabel(date)}
        </h1>
        <Button size="lg" onClick={() => setAdding(true)}>
          <PlusIcon aria-hidden="true" />
          Add Transaction
        </Button>
      </div>

      {day.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {day.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p>This day's Transactions couldn't be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => day.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {day.data && <DayView day={day.data} currency={me.currency} onAdd={() => setAdding(true)} />}

      <AddTransactionDialog
        open={adding}
        onOpenChange={setAdding}
        currency={me.currency}
        timeZone={me.timeZone}
        defaultDate={date}
      />
    </main>
  )
}

// Checked every minute, so a page left open past midnight moves on to the
// new day.
function useToday(timeZone: string) {
  const [today, setToday] = useState(() => todayIn(timeZone))
  useEffect(() => {
    const timer = setInterval(() => setToday(todayIn(timeZone)), 60_000)
    return () => clearInterval(timer)
  }, [timeZone])
  return today
}

function DayView({ day, currency, onAdd }: { day: Day; currency: CurrencyCode; onAdd: () => void }) {
  return (
    <>
      {/* No net figure, so nothing competes with Remaining (v1-spec). The
          labels say which is which, so neither total has a sign. */}
      <dl className="flex gap-10">
        <Total label="Income" amount={formatAmount(day.totals.income, currency)} />
        <Total label="Expenses" amount={formatAmount(day.totals.expense, currency)} />
      </dl>

      {day.transactions.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border-t pt-6">
          <p className="text-muted-foreground">Nothing recorded for this day.</p>
          <Button variant="outline" onClick={onAdd}>
            Add the first Transaction
          </Button>
        </div>
      ) : (
        <ul aria-label="Transactions" className="divide-y border-t">
          {day.transactions.map((transaction) => (
            <li key={transaction.id} className="flex items-baseline justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{transaction.category.name}</p>
                {transaction.note && (
                  <p className="truncate text-sm text-muted-foreground">{transaction.note}</p>
                )}
              </div>
              {/* "+" for Income, no sign for Expenses, and no red or green. */}
              <p className="shrink-0 tabular-nums">
                {formatAmount(transaction.amount, currency, transaction.category.kind)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function Total({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-xl font-medium tabular-nums">{amount}</dd>
    </div>
  )
}
