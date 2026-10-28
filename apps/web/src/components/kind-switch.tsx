import type { CategoryKind } from '@for-wealth/shared'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { KIND_LABELS } from '@/lib/categories'

// In the switch's order: Expense first, as most Transactions are one.
const SWITCH_ORDER: readonly CategoryKind[] = ['expense', 'income']

// The Expense / Income switch above a Category picker. It only chooses
// which Categories the picker shows; the API takes no kind, as the Category
// decides it (ADR 0005).
export function KindSwitch({ field }: { field: UseFormRegisterReturn<'kind'> }) {
  return (
    <fieldset className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
      <legend className="sr-only">Income or Expense</legend>
      {SWITCH_ORDER.map((value) => (
        <label
          key={value}
          className="flex h-8 cursor-pointer items-center justify-center rounded-md text-sm font-medium text-muted-foreground transition-colors select-none has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
        >
          <input type="radio" value={value} className="sr-only" {...field} />
          {KIND_LABELS[value]}
        </label>
      ))}
    </fieldset>
  )
}
