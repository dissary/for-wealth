import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import type { View } from '@/lib/transactions'
import { cn } from '@/lib/utils'

// A Period's or month's Income or Expense total, in a <dl>. The label says
// which is which, so the amount carries no sign. Given a view, the total opens
// those Transactions: the amount is the link, named "Income RM3,000.00", and
// the whole figure, label too, can be clicked.
export function Total({ label, amount, view }: { label: string; amount: string; view?: View }) {
  const id = useId()
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5',
        view &&
          'relative -mx-2 -my-1 rounded-md px-2 py-1 transition-colors hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
      )}
    >
      <dt id={`${id}-label`} className="text-sm text-muted-foreground">
        {label}
      </dt>
      <dd className="text-xl font-medium tabular-nums">
        {view ? (
          <Link
            id={`${id}-amount`}
            to="/transactions"
            search={view}
            aria-labelledby={`${id}-label ${id}-amount`}
            className="outline-none after:absolute after:inset-0"
          >
            {amount}
          </Link>
        ) : (
          amount
        )}
      </dd>
    </div>
  )
}
