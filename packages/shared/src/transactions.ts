import { z } from 'zod'
import { addYears, type CalendarDate, formatDayLabel, isCalendarDate, todayIn } from './dates.js'
import { MAX_AMOUNT } from './money.js'

// v1-spec "Transactions": a Transaction's date runs from 1 Jan 2000 to one
// year after today, with today taken in the user's time zone.
export const EARLIEST_DATE: CalendarDate = '2000-01-01'
export const NOTE_MAX_LENGTH = 200

export function latestDate(timeZone: string, now: Date = new Date()): CalendarDate {
  return addYears(todayIn(timeZone, now), 1)
}

// A Transaction's date, or the day to show, within the bounds for a user in
// `timeZone`.
export function transactionDateSchema(timeZone: string, now: Date = new Date()) {
  const latest = latestDate(timeZone, now)
  return z
    .string({ error: 'Enter a date' })
    // Stops here for a non-date, which the bounds can't say anything about.
    .refine(isCalendarDate, { error: 'Enter a date', abort: true })
    .refine((date) => date >= EARLIEST_DATE, `Use a date from ${formatDayLabel(EARLIEST_DATE)}`)
    .refine((date) => date <= latest, `Use a date up to ${formatDayLabel(latest)}`)
}

// Always positive, in the currency's minor units. Its Category, not a sign,
// says whether it is Income or an Expense (ADR 0005).
export const amountSchema = z
  .int({ error: 'Enter an amount' })
  .min(1, 'Enter an amount above zero')
  .max(MAX_AMOUNT, 'Enter a smaller amount')

// Optional and trimmed; a blank note is stored as no note.
export const noteSchema = z
  .string()
  .trim()
  .max(NOTE_MAX_LENGTH, `Use ${NOTE_MAX_LENGTH} characters or fewer`)
  .nullish()
  .transform((note) => note || null)

export const categoryIdSchema = z.uuid({ error: 'Choose a Category' })

// What the API takes to add a Transaction for a user in `timeZone`. There's
// no kind: the Category decides it.
export function newTransactionSchema(timeZone: string, now: Date = new Date()) {
  return z.object({
    categoryId: categoryIdSchema,
    amount: amountSchema,
    date: transactionDateSchema(timeZone, now),
    note: noteSchema,
  })
}

export type NewTransactionInput = z.input<ReturnType<typeof newTransactionSchema>>
export type NewTransaction = z.output<ReturnType<typeof newTransactionSchema>>

// What the API takes to edit a Transaction: any of its fields, under the same
// rules as adding. A field left out stays as it was; a blank or null note
// removes the note.
export function transactionChangesSchema(timeZone: string, now: Date = new Date()) {
  return newTransactionSchema(timeZone, now).partial()
}

export type TransactionChanges = z.output<ReturnType<typeof transactionChangesSchema>>
