import { RepeatIcon } from 'lucide-react'
import type { ReactNode } from 'react'

// A word beside a name. In words, not colour: red and green are kept for
// Budgets.
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center rounded-sm border px-1.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  )
}

// An Estimate, or a Due Date that will create one, until the real amount is
// confirmed.
export function EstimateLabel() {
  return <Tag>Estimate</Tag>
}

// A Recurring Transaction whose amount varies, so each Transaction it
// creates is an Estimate.
export function VariesLabel() {
  return <Tag>Varies</Tag>
}

// Beside a Transaction a Recurring Transaction created.
export function RecurringMark() {
  return (
    <RepeatIcon
      aria-label="From a Recurring Transaction"
      role="img"
      className="size-3.5 shrink-0 text-muted-foreground"
    />
  )
}
