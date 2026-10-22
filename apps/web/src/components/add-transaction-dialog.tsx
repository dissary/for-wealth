import {
  amountInputSchema,
  type CalendarDate,
  CATEGORY_KINDS,
  categoryIdSchema,
  type CategoryKind,
  type CurrencyCode,
  decimalPlacesOf,
  EARLIEST_DATE,
  latestDate,
  noteSchema,
  transactionDateSchema,
} from '@for-wealth/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { api } from '@/lib/api'
import { categoriesQuery } from '@/lib/categories'
import { TRANSACTIONS_KEY } from '@/lib/transactions'

// In the switch's order: Expense first, as most Transactions are one.
const KIND_LABELS: Record<CategoryKind, string> = { expense: 'Expense', income: 'Income' }
const SWITCH_ORDER: readonly CategoryKind[] = ['expense', 'income']

// The Expense / Income switch only chooses which Categories the picker
// shows; the API takes no kind, as the Category decides it (ADR 0005).
function formSchema(currency: CurrencyCode, timeZone: string) {
  return z.object({
    kind: z.enum(CATEGORY_KINDS),
    categoryId: categoryIdSchema,
    amount: amountInputSchema(currency),
    date: transactionDateSchema(timeZone),
    note: noteSchema,
  })
}

type FormInput = z.input<ReturnType<typeof formSchema>>
type FormOutput = z.output<ReturnType<typeof formSchema>>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currency: CurrencyCode
  timeZone: string
  // Where the date field starts: the day being viewed.
  defaultDate: CalendarDate
}

// Adds an Income or Expense Transaction: a dialog over the page, a sheet on
// a phone. Saving closes it and refreshes the list.
export function AddTransactionDialog({ open, onOpenChange, ...formProps }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Transaction</DialogTitle>
          <DialogDescription className="sr-only">
            Record money coming in or going out.
          </DialogDescription>
        </DialogHeader>
        {/* Inside the content, so each opening starts with a fresh form. */}
        <AddTransactionForm {...formProps} onSaved={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

const FIELDS = ['categoryId', 'amount', 'date', 'note'] as const

function AddTransactionForm({
  currency,
  timeZone,
  defaultDate,
  onSaved,
}: Omit<Props, 'open' | 'onOpenChange'> & { onSaved: () => void }) {
  const queryClient = useQueryClient()
  const categories = useQuery(categoriesQuery)
  const schema = useMemo(() => formSchema(currency, timeZone), [currency, timeZone])
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'expense', categoryId: '', amount: '', date: defaultDate, note: '' },
  })
  const { errors, isSubmitting } = form.formState
  const kind = useWatch({ control: form.control, name: 'kind' })

  async function onSubmit({ categoryId, amount, date, note }: FormOutput) {
    let res
    try {
      res = await api.transactions.$post({ json: { categoryId, amount, date, note } })
    } catch {
      return form.setError('root', { message: "Couldn't reach For Wealth. Check your connection and save again." })
    }

    if (res.ok) {
      void queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY })
      return onSaved()
    }
    if (res.status === 404) {
      void queryClient.invalidateQueries({ queryKey: categoriesQuery.queryKey })
      return form.setError(
        'categoryId',
        { message: 'That Category is no longer available. Choose another.' },
        { shouldFocus: true },
      )
    }
    if (res.status === 400) {
      const { fields } = await res.json()
      const wrong = FIELDS.filter((field) => fields[field]?.[0])
      for (const field of wrong) form.setError(field, { message: fields[field]![0] })
      if (wrong.length > 0) return form.setFocus(wrong[0]!)
    }
    // From the write limit, a middleware, so the RPC types don't list it.
    if ((res.status as number) === 429) {
      return form.setError('root', {
        message: 'That’s a lot of changes in one minute. Wait a moment, then save again.',
      })
    }
    form.setError('root', { message: "The Transaction wasn't saved. Try again." })
  }

  const options = categories.data?.[kind] ?? []
  const keypad = decimalPlacesOf(currency) === 0 ? 'numeric' : 'decimal'

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <fieldset className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <legend className="sr-only">Income or Expense</legend>
          {SWITCH_ORDER.map((value) => (
            <label
              key={value}
              className="flex h-8 cursor-pointer items-center justify-center rounded-md text-sm font-medium text-muted-foreground transition-colors select-none has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input
                type="radio"
                value={value}
                className="sr-only"
                {...form.register('kind', {
                  // A Category of the other kind can't stay chosen.
                  onChange: () => form.setValue('categoryId', ''),
                })}
              />
              {KIND_LABELS[value]}
            </label>
          ))}
        </fieldset>

        <Field data-invalid={!!errors.categoryId}>
          <FieldLabel htmlFor="categoryId">Category</FieldLabel>
          <NativeSelect
            id="categoryId"
            className="w-full"
            disabled={!categories.data}
            aria-invalid={!!errors.categoryId}
            aria-describedby="categoryId-error"
            {...form.register('categoryId')}
          >
            <NativeSelectOption value="">
              {categories.isPending ? 'Loading Categories…' : 'Choose a Category'}
            </NativeSelectOption>
            {options.map((category) => (
              <NativeSelectOption key={category.id} value={category.id}>
                {category.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError id="categoryId-error">
            {categories.isError ? "Your Categories couldn't be loaded. Close this and try again." : undefined}
          </FieldError>
          <FieldError errors={[errors.categoryId]} />
        </Field>

        <Field data-invalid={!!errors.amount}>
          <FieldLabel htmlFor="amount">Amount in {currency}</FieldLabel>
          <Input
            id="amount"
            inputMode={keypad}
            autoComplete="off"
            className="h-10 text-lg tabular-nums md:text-lg"
            aria-invalid={!!errors.amount}
            aria-describedby="amount-error"
            {...form.register('amount')}
          />
          <FieldError id="amount-error" errors={[errors.amount]} />
        </Field>

        <Field data-invalid={!!errors.date}>
          <FieldLabel htmlFor="date">Date</FieldLabel>
          <Input
            id="date"
            type="date"
            min={EARLIEST_DATE}
            max={latestDate(timeZone)}
            aria-invalid={!!errors.date}
            aria-describedby="date-error"
            {...form.register('date')}
          />
          <FieldError id="date-error" errors={[errors.date]} />
        </Field>

        <Field data-invalid={!!errors.note}>
          <FieldLabel htmlFor="note">Note</FieldLabel>
          <Input
            id="note"
            autoComplete="off"
            aria-invalid={!!errors.note}
            aria-describedby="note-hint note-error"
            {...form.register('note')}
          />
          <FieldDescription id="note-hint">Optional.</FieldDescription>
          <FieldError id="note-error" errors={[errors.note]} />
        </Field>

        <FieldError errors={[errors.root]} />
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : `Save ${KIND_LABELS[kind]}`}
        </Button>
      </FieldGroup>
    </form>
  )
}
