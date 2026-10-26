import {
  addYears,
  type CalendarDate,
  type CurrencyCode,
  EARLIEST_DATE,
  formatAmount,
  formatDayLabel,
  formatPeriodLabel,
  isCalendarDate,
  type Period,
  periodSchema,
  stepPeriod,
  transactionDateSchema,
} from '@for-wealth/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { Total } from '@/components/total'
import { TransactionDialog } from '@/components/transaction-dialog'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from '@/components/ui/native-select'
import { useToday } from '@/hooks/use-today'
import { categoriesQuery } from '@/lib/categories'
import { type Listing, periodQuery, type Transaction } from '@/lib/transactions'

// The whole view lives in the address bar, so back, refresh and a bookmark
// return to it: /transactions?period=week&date=2026-10-22&category=<id>.
// Each value that isn't valid is dropped, and the router takes it out of the
// address bar too. Without a period it's a Day; without a date, today.
const searchSchema = z.object({
  period: periodSchema.optional().catch(undefined),
  date: z.string().refine(isCalendarDate).optional().catch(undefined),
  category: z.uuid().optional().catch(undefined),
})

export const Route = createFileRoute('/_signed-in/transactions')({
  validateSearch: searchSchema,
  // The date's bounds depend on today in the user's own time zone, which
  // only the signed-in layout knows. One outside them falls back to today.
  beforeLoad: ({ context, search }) => {
    if (search.date && !transactionDateSchema(context.me.timeZone).safeParse(search.date).success) {
      throw redirect({ to: '/transactions', search: { ...search, date: undefined }, replace: true })
    }
  },
  component: TransactionsPage,
})

const PERIOD_LABELS: Record<Period, string> = { day: 'Day', week: 'Week', month: 'Month' }

function TransactionsPage() {
  const { me } = Route.useRouteContext()
  const search = Route.useSearch()
  const today = useToday(me.timeZone)
  const period = search.period ?? 'day'
  const date = search.date ?? today
  const listing = useQuery(periodQuery({ period, date, category: search.category }))
  // Adding when there's no Transaction, else editing it. Closing keeps the
  // Transaction, so the dialog doesn't turn into "Add" while it fades out.
  const [dialog, setDialog] = useState<{ open: boolean; transaction?: Transaction }>({ open: false })
  const add = () => setDialog({ open: true })

  const bounds = { earliest: EARLIEST_DATE, latest: addYears(today, 1) }

  return (
    // A reading column under the wider header: each row is just a Category
    // and an amount, too far apart across the Dashboard's full width.
    <main className="flex max-w-3xl flex-col gap-6 py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          {formatPeriodLabel(period, date)}
        </h1>
        <Button size="lg" onClick={add}>
          <PlusIcon aria-hidden="true" />
          Add Transaction
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <nav aria-label="Periods" className="flex items-center gap-1">
          <StepLink period={period} to={stepPeriod(period, date, -1, bounds)} direction={-1} />
          <StepLink period={period} to={stepPeriod(period, date, 1, bounds)} direction={1} />
          {/* Off only on today itself: a Week or Month holding today may be
              shown from another of its days, which switching to a Day would
              keep. */}
          {date === today ? (
            <Button variant="outline" disabled>
              Today
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link from={Route.fullPath} search={(prev) => ({ ...prev, date: undefined })}>
                Today
              </Link>
            </Button>
          )}
        </nav>
        <PeriodSwitch period={period} />
        <CategoryFilter category={search.category} filtered={listing.data?.category ?? null} />
      </div>

      {listing.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {listing.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p>These Transactions couldn't be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => listing.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {listing.data === null && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p>That Category isn't available.</p>
          <Button variant="outline" size="sm" asChild>
            <Link from={Route.fullPath} search={(prev) => ({ ...prev, category: undefined })}>
              Show every Category
            </Link>
          </Button>
        </div>
      )}
      {listing.data && (
        <PeriodView
          listing={listing.data}
          currency={me.currency}
          stale={listing.isPlaceholderData}
          onAdd={add}
          onEdit={(transaction) => setDialog({ open: true, transaction })}
        />
      )}

      <TransactionDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        transaction={dialog.transaction}
        currency={me.currency}
        timeZone={me.timeZone}
        // A single Day starts the date field on that day; otherwise today
        // (v1-spec "Transactions").
        defaultDate={period === 'day' ? date : today}
      />
    </main>
  )
}

// ‹ or ›, which stop at the Periods holding the bounds of a Transaction's date.
function StepLink({ period, to, direction }: { period: Period; to: CalendarDate | null; direction: -1 | 1 }) {
  const label = `${direction === -1 ? 'Previous' : 'Next'} ${PERIOD_LABELS[period].toLowerCase()}`
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
      <Link from={Route.fullPath} search={(prev) => ({ ...prev, date: to })} aria-label={label}>
        <Icon aria-hidden="true" />
      </Link>
    </Button>
  )
}

// Day, Week or Month. Switching keeps the date, so the new Period holds it.
function PeriodSwitch({ period }: { period: Period }) {
  return (
    <nav aria-label="Period" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
      {(Object.keys(PERIOD_LABELS) as Period[]).map((value) => (
        <Link
          key={value}
          from={Route.fullPath}
          search={(prev) => ({ ...prev, period: value })}
          aria-current={value === period ? 'page' : undefined}
          className="flex h-7 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-background aria-[current=page]:text-foreground aria-[current=page]:shadow-sm"
        >
          {PERIOD_LABELS[value]}
        </Link>
      ))}
    </nav>
  )
}

// Narrows the list and the totals to one Category. An archived Category isn't
// in the picker's lists, but a link to one still works, so it is added; so is
// one that isn't available, which the page says, rather than the picker
// showing "All" while a filter is on.
function CategoryFilter({ category, filtered }: { category: string | undefined; filtered: Listing['category'] }) {
  const categories = useQuery(categoriesQuery)
  const navigate = Route.useNavigate()
  const listed = categories.data && [...categories.data.expense, ...categories.data.income]
  const unlisted = category && listed && !listed.some((c) => c.id === category) ? category : null

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="category-filter" className="text-sm text-muted-foreground">
        Category
      </label>
      <NativeSelect
        id="category-filter"
        value={category ?? ''}
        disabled={!categories.data}
        onChange={(event) =>
          void navigate({ search: (prev) => ({ ...prev, category: event.target.value || undefined }) })
        }
      >
        <NativeSelectOption value="">All</NativeSelectOption>
        {unlisted && (
          <NativeSelectOption value={unlisted}>
            {filtered?.id === unlisted ? `${filtered.name} (archived)` : 'Unavailable Category'}
          </NativeSelectOption>
        )}
        {categories.data && (
          <>
            <NativeSelectOptGroup label="Expense">
              {categories.data.expense.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
            <NativeSelectOptGroup label="Income">
              {categories.data.income.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
          </>
        )}
      </NativeSelect>
    </div>
  )
}

function PeriodView({
  listing,
  currency,
  stale,
  onAdd,
  onEdit,
}: {
  listing: Listing
  currency: CurrencyCode
  // Still the previous Period's, while the new one loads.
  stale: boolean
  onAdd: () => void
  onEdit: (transaction: Transaction) => void
}) {
  const where = listing.category ? ` under ${listing.category.name}` : ''

  return (
    <div aria-busy={stale} className="flex flex-col gap-6 transition-opacity aria-busy:opacity-60">
      {/* No net figure, so nothing competes with Remaining (v1-spec). The
          labels say which is which, so neither total has a sign. With a
          filter on, they cover only that Category. */}
      <dl className="flex gap-10">
        <Total label="Income" amount={formatAmount(listing.totals.income, currency)} />
        <Total label="Expenses" amount={formatAmount(listing.totals.expense, currency)} />
      </dl>

      {listing.transactions.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border-t pt-6">
          <p className="text-muted-foreground">
            Nothing recorded{where} for this {PERIOD_LABELS[listing.period].toLowerCase()}.
          </p>
          <Button variant="outline" onClick={onAdd}>
            Add a Transaction
          </Button>
        </div>
      ) : listing.period === 'day' ? (
        // The heading already names the day.
        <TransactionList transactions={listing.transactions} currency={currency} onEdit={onEdit} />
      ) : (
        <div className="flex flex-col gap-6">
          {byDate(listing.transactions).map(([date, transactions]) => (
            <section key={date} aria-labelledby={`day-${date}`}>
              <h2 id={`day-${date}`} className="pb-2 text-sm font-medium text-muted-foreground">
                {formatDayLabel(date)}
              </h2>
              <TransactionList transactions={transactions} currency={currency} onEdit={onEdit} />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

// The API sends them newest date first, so each date's run is contiguous.
function byDate(transactions: Transaction[]): [CalendarDate, Transaction[]][] {
  const groups: [CalendarDate, Transaction[]][] = []
  for (const transaction of transactions) {
    const last = groups.at(-1)
    if (last?.[0] === transaction.date) last[1].push(transaction)
    else groups.push([transaction.date, [transaction]])
  }
  return groups
}

// Each row opens the Transaction in the dialog, to edit or delete it.
function TransactionList({
  transactions,
  currency,
  onEdit,
}: {
  transactions: Transaction[]
  currency: CurrencyCode
  onEdit: (transaction: Transaction) => void
}) {
  return (
    <ul aria-label="Transactions" className="divide-y border-t">
      {transactions.map((transaction) => (
        <li key={transaction.id}>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => onEdit(transaction)}
            className="-mx-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-4 rounded-md px-2 py-3 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="min-w-0">
              <span className="block font-medium">{transaction.category.name}</span>
              {transaction.note && (
                <span className="block truncate text-sm text-muted-foreground">{transaction.note}</span>
              )}
            </span>
            {/* "+" for Income, no sign for Expenses, and no red or green. */}
            <span className="shrink-0 tabular-nums">
              {formatAmount(transaction.amount, currency, transaction.category.kind)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
