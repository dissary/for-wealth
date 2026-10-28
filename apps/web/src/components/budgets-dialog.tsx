import {
  amountForInput,
  type CalendarMonth,
  type CurrencyCode,
  decimalPlacesOf,
  firstDayOf,
  formatPeriodLabel,
  limitInputSchema,
} from '@for-wealth/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { type Budget, BUDGETS_KEY, budgetsQuery } from '@/lib/budgets'
import { DASHBOARD_KEY } from '@/lib/dashboard'
import { isTooManyWrites, TOO_MANY_WRITES } from '@/lib/write-limit'

// One typed field per Category; blank means no limit.
function formSchema(currency: CurrencyCode) {
  return z.object({
    limits: z.array(z.object({ categoryId: z.string(), limit: limitInputSchema(currency) })),
  })
}

type FormInput = z.input<ReturnType<typeof formSchema>>
type FormOutput = z.output<ReturnType<typeof formSchema>>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  month: CalendarMonth
  currency: CurrencyCode
}

// Sets a month's Budgets: a dialog over the page, a sheet on a phone. Each
// change applies from this month on, so later months carry it and earlier
// months never change (ADR 0007). Saving closes it and refreshes the
// Dashboard.
export function BudgetsDialog({ open, onOpenChange, month, currency }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Budgets for {formatPeriodLabel('month', firstDayOf(month))}</DialogTitle>
          <DialogDescription>
            Each limit carries forward to later months until you change it. Leave one blank for no limit.
          </DialogDescription>
        </DialogHeader>
        {/* Inside the content, so each opening starts with a fresh form. */}
        <BudgetsLoader month={month} currency={currency} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function BudgetsLoader({ month, currency, onDone }: Omit<Props, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const budgets = useQuery(budgetsQuery(month))
  // The form starts on the limits it's given, so it waits for the latest
  // rather than starting on ones saved since elsewhere.
  if (budgets.data && !budgets.isFetching) {
    return <BudgetsForm budgets={budgets.data} month={month} currency={currency} onDone={onDone} />
  }
  if (budgets.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
        <p>Your Budgets couldn't be loaded.</p>
        <Button variant="outline" size="sm" onClick={() => budgets.refetch()}>
          Try again
        </Button>
      </div>
    )
  }
  return <p className="text-sm text-muted-foreground">Loading…</p>
}

function BudgetsForm({
  budgets,
  month,
  currency,
  onDone,
}: {
  budgets: Budget[]
  month: CalendarMonth
  currency: CurrencyCode
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const schema = useMemo(() => formSchema(currency), [currency])
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    // Each field starts on the month's limit, set that month or carried
    // forward.
    defaultValues: {
      limits: budgets.map(({ category, limit }) => ({
        categoryId: category.id,
        limit: limit === null ? '' : amountForInput(limit, currency),
      })),
    },
  })
  const { errors, isSubmitting } = form.formState

  async function onSubmit({ limits }: FormOutput) {
    // Only the limits changed here, so one saved elsewhere since the dialog
    // opened isn't put back. Whichever save comes last wins.
    const opened = new Map(budgets.map(({ category, limit }) => [category.id, limit]))
    const changed = limits.filter(({ categoryId, limit }) => limit !== opened.get(categoryId))
    // Nothing to save, so no request spends a write from the limit.
    if (changed.length === 0) return onDone()
    let res
    try {
      res = await api.budgets.$put({ query: { month }, json: { limits: changed } })
    } catch {
      return form.setError('root', { message: "Couldn't reach For Wealth. Check your connection and save again." })
    }

    if (res.ok) {
      void queryClient.invalidateQueries({ queryKey: BUDGETS_KEY })
      void queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY })
      return onDone()
    }
    if (res.status === 404) {
      void queryClient.invalidateQueries({ queryKey: BUDGETS_KEY })
      return form.setError('root', {
        message: 'One of these Categories is no longer available. Close this and open Edit Budgets again.',
      })
    }
    if (isTooManyWrites(res)) {
      return form.setError('root', { message: TOO_MANY_WRITES })
    }
    form.setError('root', { message: "The Budgets weren't saved. Try again." })
  }

  const keypad = decimalPlacesOf(currency) === 0 ? 'numeric' : 'decimal'

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <FieldSet className="gap-3">
          <FieldLegend variant="label" className="text-muted-foreground">
            Monthly limit in {currency}
          </FieldLegend>
          <ul className="flex flex-col divide-y">
            {budgets.map(({ category }, i) => {
              const id = `limit-${category.id}`
              const error = errors.limits?.[i]?.limit
              return (
                <li key={category.id} className="py-2">
                  <Field data-invalid={!!error}>
                    <div className="flex items-center justify-between gap-4">
                      <FieldLabel htmlFor={id}>{category.name}</FieldLabel>
                      <Input
                        id={id}
                        inputMode={keypad}
                        autoComplete="off"
                        className="w-36 text-right tabular-nums"
                        aria-invalid={!!error}
                        aria-describedby={`${id}-error`}
                        {...form.register(`limits.${i}.limit`)}
                      />
                    </div>
                    <FieldError id={`${id}-error`} className="text-right" errors={[error]} />
                  </Field>
                </li>
              )
            })}
          </ul>
        </FieldSet>

        <FieldError errors={[errors.root]} />
        {/* Nothing is saved until every field is valid. */}
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save Budgets'}
        </Button>
      </FieldGroup>
    </form>
  )
}
