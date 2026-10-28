import { type CurrencyCode, formatAmount } from '@for-wealth/shared'
import { TriangleAlertIcon } from 'lucide-react'

// When a month's Budgets, plus its Commitments in Categories without one,
// come to more than Expected Income. In ink, not red: it's about the whole
// month, not one Budget, and it never blocks saving (v1-spec "The Dashboard
// in slice 5").
export function BudgetsWarning({ overBy, currency }: { overBy: number; currency: CurrencyCode }) {
  return (
    <p role="status" className="flex items-start gap-2 text-sm">
      <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      Budgets and Commitments come to {formatAmount(overBy, currency)} more than Expected Income.
    </p>
  )
}
