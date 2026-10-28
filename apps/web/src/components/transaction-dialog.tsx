import {
  amountForInput,
  amountInputSchema,
  type CalendarDate,
  CATEGORY_KINDS,
  categoryIdSchema,
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
import { ConfirmAction } from '@/components/confirm-action'
import { KindSwitch } from '@/components/kind-switch'
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
import { categoriesQuery, KIND_LABELS, pickerOptions } from '@/lib/categories'
import { type Transaction, TRANSACTIONS_KEY } from '@/lib/transactions'
import { isTooManyWrites, TOO_MANY_WRITES } from '@/lib/write-limit'

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
  // Where the date field starts when adding: the day being viewed.
  defaultDate: CalendarDate
  // The Transaction to edit, filled in; without one, a new one is added.
  transaction?: Transaction | undefined
}

// Adds an Income or Expense Transaction, or edits or deletes one: a dialog
// over the page, a sheet on a phone. Saving or deleting closes it and
// refreshes the list.
export function TransactionDialog({ open, onOpenChange, transaction, ...formProps }: Props) {
  const close = () => onOpenChange(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle(transaction)}</DialogTitle>
          {/* Saving an Estimate confirms it (v1-spec "Recurring Transactions"),
              so that is said out loud; otherwise the title says it all. */}
          {transaction?.estimate ? (
            <DialogDescription>This is an Estimate. Saving confirms the amount.</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">
              {transaction ? 'Change or delete this Transaction.' : 'Record money coming in or going out.'}
            </DialogDescription>
          )}
        </DialogHeader>
        {/* Inside the content, so each opening starts with a fresh form. */}
        <TransactionForm {...formProps} transaction={transaction} onDone={close} />
        {transaction && (
          <ConfirmAction
            action="Delete"
            question="Delete this Transaction for good? This can't be undone."
            confirm="Delete Transaction"
            working="Deleting…"
            failed="The Transaction wasn't deleted."
            run={() => api.transactions[':id'].$delete({ param: { id: transaction.id } })}
            onDone={close}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function dialogTitle(transaction: Transaction | undefined) {
  if (!transaction) return 'Add Transaction'
  return transaction.estimate ? 'Confirm Estimate' : 'Edit Transaction'
}

const FIELDS = ['categoryId', 'amount', 'date', 'note'] as const

function TransactionForm({
  currency,
  timeZone,
  defaultDate,
  transaction,
  onDone,
}: Omit<Props, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const queryClient = useQueryClient()
  const categories = useQuery(categoriesQuery)
  const schema = useMemo(() => formSchema(currency, timeZone), [currency, timeZone])
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: transaction
      ? {
          kind: transaction.category.kind,
          categoryId: transaction.category.id,
          amount: amountForInput(transaction.amount, currency),
          date: transaction.date,
          note: transaction.note ?? '',
        }
      : { kind: 'expense', categoryId: '', amount: '', date: defaultDate, note: '' },
  })
  const { errors, isSubmitting } = form.formState
  const kind = useWatch({ control: form.control, name: 'kind' })

  async function onSubmit({ categoryId, amount, date, note }: FormOutput) {
    const json = { categoryId, amount, date, note }
    let res
    try {
      // Every field is sent; whichever save comes last wins.
      res = transaction
        ? await api.transactions[':id'].$patch({ param: { id: transaction.id }, json })
        : await api.transactions.$post({ json })
    } catch {
      return form.setError('root', { message: "Couldn't reach For Wealth. Check your connection and save again." })
    }

    if (res.ok) {
      void queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY })
      return onDone()
    }
    if (res.status === 404) {
      const { code } = await res.json()
      if (code === 'TRANSACTION_NOT_FOUND') {
        void queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY })
        return form.setError('root', { message: 'This Transaction no longer exists. Close this to see the list.' })
      }
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
    if (isTooManyWrites(res)) {
      return form.setError('root', { message: TOO_MANY_WRITES })
    }
    form.setError('root', { message: "The Transaction wasn't saved. Try again." })
  }

  const options = pickerOptions(categories.data?.[kind] ?? [], transaction?.category, kind)
  const keypad = decimalPlacesOf(currency) === 0 ? 'numeric' : 'decimal'

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <KindSwitch
          field={form.register('kind', {
            // A Category of the other kind can't stay chosen.
            onChange: () => form.setValue('categoryId', ''),
          })}
        />

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
          {isSubmitting ? 'Saving…' : transaction?.estimate ? 'Confirm amount' : `Save ${KIND_LABELS[kind]}`}
        </Button>
      </FieldGroup>
    </form>
  )
}
