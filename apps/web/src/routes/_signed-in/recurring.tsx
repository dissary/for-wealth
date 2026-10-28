import { type CurrencyCode, formatAmount, formatDayLabel, formatSchedule } from '@for-wealth/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronRightIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { VariesLabel } from '@/components/markers'
import { RecurringDialog } from '@/components/recurring-dialog'
import { RowButton } from '@/components/row-button'
import { Button } from '@/components/ui/button'
import { useToday } from '@/hooks/use-today'
import { type RecurringTransaction, recurringQuery } from '@/lib/recurring'

// Every Recurring Transaction: the ones still going by next Due Date, and the
// stopped ones, kept for the Transactions they created (ADR 0009).
export const Route = createFileRoute('/_signed-in/recurring')({
  component: RecurringPage,
})

function RecurringPage() {
  const { me } = Route.useRouteContext()
  const today = useToday(me.timeZone)
  const recurring = useQuery(recurringQuery)
  // Adding when there's none, else editing it. Closing keeps it, so the
  // dialog doesn't turn into "Add" while it fades out.
  const [dialog, setDialog] = useState<{ open: boolean; recurring?: RecurringTransaction }>({ open: false })
  const add = () => setDialog({ open: true })

  return (
    // A reading column, as on the Transactions page.
    <main className="flex max-w-3xl flex-col gap-6 py-8 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">Recurring</h1>
        <Button size="lg" onClick={add}>
          <PlusIcon aria-hidden="true" />
          Add Recurring Transaction
        </Button>
      </div>

      {recurring.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {recurring.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p>Your Recurring Transactions couldn't be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => recurring.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {recurring.data &&
        (recurring.data.active.length === 0 ? (
          <div className="flex flex-col items-start gap-3 border-t pt-6">
            <p className="max-w-prose text-muted-foreground">
              Add your salary, rent and bills once, and each is recorded on its Due Date. The Dashboard counts
              the ones still to come this month.
            </p>
            <Button variant="outline" onClick={add}>
              Add a Recurring Transaction
            </Button>
          </div>
        ) : (
          <RecurringList
            label="Recurring Transactions"
            list={recurring.data.active}
            currency={me.currency}
            onEdit={(chosen) => setDialog({ open: true, recurring: chosen })}
          />
        ))}

      {recurring.data && recurring.data.stopped.length > 0 && (
        // Collapsed: they create nothing more, so they're only for looking back.
        <details className="group border-t pt-4">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-md text-sm font-medium text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon aria-hidden="true" className="size-4 transition-transform group-open:rotate-90" />
            Stopped ({recurring.data.stopped.length})
          </summary>
          <div className="pt-3">
            <RecurringList
              label="Stopped Recurring Transactions"
              list={recurring.data.stopped}
              currency={me.currency}
            />
          </div>
        </details>
      )}

      <RecurringDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        recurring={dialog.recurring}
        currency={me.currency}
        timeZone={me.timeZone}
        today={today}
      />
    </main>
  )
}

// Each row opens it in the dialog to edit or stop it, unless it's stopped,
// when it's read-only.
function RecurringList({
  label,
  list,
  currency,
  onEdit,
}: {
  label: string
  list: RecurringTransaction[]
  currency: CurrencyCode
  onEdit?: (recurring: RecurringTransaction) => void
}) {
  return (
    <ul aria-label={label} className="divide-y border-t">
      {list.map((recurring) => {
        const content = (
          <>
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-medium">
                {recurring.category.archived ? `${recurring.category.name} (archived)` : recurring.category.name}
                {recurring.varies && <VariesLabel />}
              </span>
              {recurring.note && (
                <span className="block truncate text-sm text-muted-foreground">{recurring.note}</span>
              )}
              <span className="block text-sm text-muted-foreground">
                {formatSchedule(recurring.schedule)}
                {!recurring.stoppedAt && <> · next on {formatDayLabel(recurring.nextDueDate)}</>}
              </span>
            </span>
            {/* "+" for Income, no sign for Expenses, and no red or green. */}
            <span className="shrink-0 tabular-nums">
              {formatAmount(recurring.amount, currency, recurring.category.kind)}
            </span>
          </>
        )
        return (
          <li key={recurring.id}>
            {onEdit ? (
              <RowButton onClick={() => onEdit(recurring)}>{content}</RowButton>
            ) : (
              <div className="flex items-baseline justify-between gap-4 py-3 text-muted-foreground">{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
