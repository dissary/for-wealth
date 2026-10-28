import {
  amountForInput,
  amountInputSchema,
  type CalendarDate,
  CATEGORY_KINDS,
  categoryIdSchema,
  type CurrencyCode,
  decimalPlacesOf,
  FREQUENCIES,
  firstDueDateFrom,
  formatDayLabel,
  type Frequency,
  isoWeekday,
  latestDate,
  monthName,
  noteSchema,
  ordinal,
  recurringStartSchema,
  type Schedule,
  scheduleSchema,
  weekdayName,
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
import type { RecurringTransaction } from '@/lib/recurring'
import { TRANSACTIONS_KEY } from '@/lib/transactions'
import { isTooManyWrites, TOO_MANY_WRITES } from '@/lib/write-limit'

const FREQUENCY_LABELS: Record<Frequency, string> = { monthly: 'Every month', weekly: 'Every week', yearly: 'Every year' }
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => i + 1)
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

// The schedule from the fields its frequency uses. The selects hold strings.
function scheduleFrom({ frequency, day, weekday, month }: Record<'day' | 'weekday' | 'month', string> & {
  frequency: Frequency
}) {
  switch (frequency) {
    case 'monthly':
      return { frequency, day: Number(day) }
    case 'weekly':
      return { frequency, weekday: Number(weekday) }
    case 'yearly':
      return { frequency, month: Number(month), day: Number(day) }
  }
}

// Every schedule field starts on something, so switching frequency never
// leaves one blank: those the schedule doesn't use start on today's.
function scheduleFields(schedule: Schedule, today: CalendarDate) {
  const [, month, day] = today.split('-').map(Number) as [number, number, number]
  return {
    frequency: schedule.frequency,
    day: String(schedule.frequency === 'weekly' ? day : schedule.day),
    weekday: String(schedule.frequency === 'weekly' ? schedule.weekday : isoWeekday(today)),
    month: String(schedule.frequency === 'yearly' ? schedule.month : month),
  }
}

// The Expense / Income switch only chooses which Categories the picker
// shows, as for a Transaction. The start date is asked only when adding.
function formSchema(currency: CurrencyCode, timeZone: string, adding: boolean) {
  return z
    .object({
      kind: z.enum(CATEGORY_KINDS),
      categoryId: categoryIdSchema,
      amount: amountInputSchema(currency),
      varies: z.boolean(),
      frequency: z.enum(FREQUENCIES),
      day: z.string(),
      weekday: z.string(),
      month: z.string(),
      startDate: adding ? recurringStartSchema(timeZone) : z.string(),
      note: noteSchema,
    })
    .transform((form, ctx) => {
      const schedule = scheduleSchema.safeParse(scheduleFrom(form))
      if (!schedule.success) {
        ctx.addIssue({ code: 'custom', path: ['day'], message: 'That month doesn’t have that day' })
        return z.NEVER
      }
      return { ...form, schedule: schedule.data }
    })
}

type FormInput = z.input<ReturnType<typeof formSchema>>
type FormOutput = z.output<ReturnType<typeof formSchema>>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currency: CurrencyCode
  timeZone: string
  today: CalendarDate
  // The one to edit, filled in; without one, a new one is added.
  recurring?: RecurringTransaction | undefined
}

// Adds a Recurring Transaction, or edits or stops one: a dialog over the
// page, a sheet on a phone. Saving or stopping closes it and refreshes the
// lists and the Dashboard.
export function RecurringDialog({ open, onOpenChange, recurring, ...formProps }: Props) {
  const close = () => onOpenChange(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{recurring ? 'Edit Recurring Transaction' : 'Add Recurring Transaction'}</DialogTitle>
          <DialogDescription>
            {recurring
              ? 'Changes reach only the Transactions it hasn’t created yet.'
              : 'It creates a Transaction on each Due Date.'}
          </DialogDescription>
        </DialogHeader>
        {/* Inside the content, so each opening starts with a fresh form. */}
        <RecurringForm {...formProps} recurring={recurring} onDone={close} />
        {recurring && (
          <ConfirmAction
            action="Stop"
            question="Stop this for good? It creates nothing more, and the Transactions it already created stay. This can't be undone."
            confirm="Stop Recurring Transaction"
            working="Stopping…"
            failed="The Recurring Transaction wasn't stopped."
            run={() => api.recurring[':id'].stop.$post({ param: { id: recurring.id } })}
            onDone={close}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

const FIELDS = ['categoryId', 'amount', 'startDate', 'note'] as const

function RecurringForm({
  currency,
  timeZone,
  today,
  recurring,
  onDone,
}: Omit<Props, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const queryClient = useQueryClient()
  const categories = useQuery(categoriesQuery)
  const adding = !recurring
  const schema = useMemo(() => formSchema(currency, timeZone, adding), [currency, timeZone, adding])
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: recurring
      ? {
          kind: recurring.category.kind,
          categoryId: recurring.category.id,
          amount: amountForInput(recurring.amount, currency),
          varies: recurring.varies,
          ...scheduleFields(recurring.schedule, today),
          startDate: recurring.startDate,
          note: recurring.note ?? '',
        }
      : {
          kind: 'expense',
          categoryId: '',
          amount: '',
          varies: false,
          ...scheduleFields({ frequency: 'monthly', day: Number(today.slice(8)) }, today),
          startDate: today,
          note: '',
        },
  })
  const { errors, isSubmitting } = form.formState
  const [kind, varies, frequency, day, weekday, month, startDate] = useWatch({
    control: form.control,
    name: ['kind', 'varies', 'frequency', 'day', 'weekday', 'month', 'startDate'],
  })

  async function onSubmit({ categoryId, amount, varies, schedule, startDate, note }: FormOutput) {
    let res
    try {
      // Every field is sent; whichever save comes last wins.
      res = recurring
        ? await api.recurring[':id'].$patch({
            param: { id: recurring.id },
            json: { categoryId, amount, varies, schedule, note },
          })
        : await api.recurring.$post({ json: { categoryId, amount, varies, schedule, startDate, note } })
    } catch {
      return form.setError('root', { message: "Couldn't reach For Wealth. Check your connection and save again." })
    }

    if (res.ok) {
      void queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY })
      return onDone()
    }
    if (res.status === 404) {
      const { code } = await res.json()
      if (code === 'RECURRING_NOT_FOUND') {
        void queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY })
        return form.setError('root', {
          message: 'This Recurring Transaction is no longer available. Close this to see the list.',
        })
      }
      void queryClient.invalidateQueries({ queryKey: categoriesQuery.queryKey })
      return form.setError(
        'categoryId',
        { message: 'That Category is no longer available. Choose another.' },
        { shouldFocus: true },
      )
    }
    if (res.status === 409) {
      return form.setError('root', {
        message: 'You have the most Recurring Transactions there can be. Stop one before adding another.',
      })
    }
    if (res.status === 400) {
      const { fields } = await res.json()
      const wrong = FIELDS.filter((field) => fields[field]?.[0])
      for (const field of wrong) form.setError(field, { message: fields[field]![0] })
      if (fields.schedule?.[0]) form.setError('day', { message: fields.schedule[0] })
      if (wrong.length > 0) return form.setFocus(wrong[0]!)
    }
    if (isTooManyWrites(res)) {
      return form.setError('root', { message: TOO_MANY_WRITES })
    }
    form.setError('root', { message: "The Recurring Transaction wasn't saved. Try again." })
  }

  const options = pickerOptions(categories.data?.[kind] ?? [], recurring?.category, kind)
  const keypad = decimalPlacesOf(currency) === 0 ? 'numeric' : 'decimal'

  // "First on Tue, 25 Nov 2026", while the schedule and start date are valid.
  const schedule = scheduleSchema.safeParse(scheduleFrom({ frequency, day, weekday, month }))
  const firstDue =
    adding && schedule.success && recurringStartSchema(timeZone).safeParse(startDate).success
      ? firstDueDateFrom(schedule.data, startDate)
      : null

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
          <FieldLabel htmlFor="amount">
            {varies ? 'Estimated amount' : 'Amount'} in {currency}
          </FieldLabel>
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

        <Field orientation="horizontal">
          <input
            id="varies"
            type="checkbox"
            className="size-4 shrink-0 accent-primary"
            aria-describedby="varies-hint"
            {...form.register('varies')}
          />
          <div className="flex flex-col gap-1">
            <FieldLabel htmlFor="varies">The amount varies</FieldLabel>
            <FieldDescription id="varies-hint">
              Each one is created as an Estimate, for you to confirm the real amount.
            </FieldDescription>
          </div>
        </Field>

        <Field data-invalid={!!errors.day}>
          <FieldLabel htmlFor="frequency">Due</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <NativeSelect id="frequency" aria-describedby="schedule-hint day-error" {...form.register('frequency')}>
              {FREQUENCIES.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {FREQUENCY_LABELS[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {frequency === 'weekly' ? (
              <NativeSelect aria-label="Weekday" {...form.register('weekday')}>
                {WEEKDAYS.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    on {weekdayName(value)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            ) : (
              <NativeSelect aria-label="Day" aria-invalid={!!errors.day} {...form.register('day')}>
                {DAYS.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    on the {ordinal(value)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
            {frequency === 'yearly' && (
              <NativeSelect aria-label="Month" aria-invalid={!!errors.day} {...form.register('month')}>
                {MONTHS.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    of {monthName(value)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </div>
          <FieldDescription id="schedule-hint">
            {frequency !== 'weekly' && Number(day) > 28
              ? 'In a month without that day, it’s due on the last day.'
              : adding
                ? 'Due Dates before the start date are never created.'
                : 'Moving it never creates a second Transaction in a period that already has one.'}
          </FieldDescription>
          <FieldError id="day-error" errors={[errors.day]} />
        </Field>

        {adding && (
          <Field data-invalid={!!errors.startDate}>
            <FieldLabel htmlFor="startDate">Starts</FieldLabel>
            <Input
              id="startDate"
              type="date"
              min={today}
              max={latestDate(timeZone)}
              aria-invalid={!!errors.startDate}
              aria-describedby="startDate-hint startDate-error"
              {...form.register('startDate')}
            />
            <FieldDescription id="startDate-hint" aria-live="polite">
              {firstDue && `First on ${formatDayLabel(firstDue)}.`}
            </FieldDescription>
            <FieldError id="startDate-error" errors={[errors.startDate]} />
          </Field>
        )}

        <Field data-invalid={!!errors.note}>
          <FieldLabel htmlFor="note">Note</FieldLabel>
          <Input
            id="note"
            autoComplete="off"
            aria-invalid={!!errors.note}
            aria-describedby="note-hint note-error"
            {...form.register('note')}
          />
          <FieldDescription id="note-hint">Optional. Each Transaction it creates gets it too.</FieldDescription>
          <FieldError id="note-error" errors={[errors.note]} />
        </Field>

        <FieldError errors={[errors.root]} />
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : `Save Recurring ${KIND_LABELS[kind]}`}
        </Button>
      </FieldGroup>
    </form>
  )
}
