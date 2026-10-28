import { z } from 'zod'
import {
  addDays,
  addMonths,
  type CalendarDate,
  daysInMonth,
  isoWeekday,
  todayIn,
  toCalendarDate,
  utcMidnight,
} from './dates.js'
import { amountSchema, categoryIdSchema, noteSchema, transactionDateSchema } from './transactions.js'

// How often a Recurring Transaction is due (v1-spec "Recurring Transactions").
export const FREQUENCIES = ['monthly', 'weekly', 'yearly'] as const
export type Frequency = (typeof FREQUENCIES)[number]

// Monthly on a day of the month, weekly on a weekday (1 for Monday to 7 for
// Sunday), or yearly on a day and month. A day the month doesn't have falls
// back to its last day: day 31 is 30 Apr, and 29 Feb is 28 Feb in a year
// without one.
export type Schedule =
  | { frequency: 'monthly'; day: number }
  | { frequency: 'weekly'; weekday: number }
  | { frequency: 'yearly'; month: number; day: number }

// At most this many that aren't stopped per user, so catching up stays cheap.
export const RECURRING_LIMIT = 100

// The Due Date in the given month, for a monthly or yearly schedule.
function dueDateIn(day: number, year: number, month: number): CalendarDate {
  return toCalendarDate(year, month, Math.min(day, daysInMonth(year, month)))
}

// The schedule's first Due Date on or after `date`.
export function firstDueDateFrom(schedule: Schedule, date: CalendarDate): CalendarDate {
  const [year, month] = date.split('-').map(Number) as [number, number]
  switch (schedule.frequency) {
    case 'weekly':
      return addDays(date, (schedule.weekday - isoWeekday(date) + 7) % 7)
    case 'monthly': {
      const due = dueDateIn(schedule.day, year, month)
      if (due >= date) return due
      return month === 12 ? dueDateIn(schedule.day, year + 1, 1) : dueDateIn(schedule.day, year, month + 1)
    }
    case 'yearly': {
      const due = dueDateIn(schedule.day, year, schedule.month)
      return due >= date ? due : dueDateIn(schedule.day, year + 1, schedule.month)
    }
  }
}

// The Due Date after `dueDate`.
export function dueDateAfter(schedule: Schedule, dueDate: CalendarDate): CalendarDate {
  return firstDueDateFrom(schedule, addDays(dueDate, 1))
}

// Every Due Date from `from` to `to`, both included, in date order.
export function dueDatesBetween(schedule: Schedule, from: CalendarDate, to: CalendarDate): CalendarDate[] {
  const dates = []
  for (let date = firstDueDateFrom(schedule, from); date <= to; date = dueDateAfter(schedule, date)) {
    dates.push(date)
  }
  return dates
}

// The first day of the week, month or year after the one holding `date`.
function startOfNextPeriod(frequency: Frequency, date: CalendarDate): CalendarDate {
  const [year, month] = date.split('-').map(Number) as [number, number]
  switch (frequency) {
    case 'weekly':
      return addDays(date, 8 - isoWeekday(date))
    case 'monthly':
      return addMonths(toCalendarDate(year, month, 1), 1)
    case 'yearly':
      return toCalendarDate(year + 1, 1, 1)
  }
}

// The next Due Date once the schedule changes. A period (week, month or year,
// under the old schedule) that already has a Transaction never gets a second
// one, so it is the new schedule's first Due Date from the next period on,
// or from the start date when none has been created, and never before today
// (v1-spec "Recurring Transactions").
export function nextDueDateAfterChange({
  from,
  to,
  lastDueDate,
  startDate,
  today,
}: {
  from: Schedule
  to: Schedule
  lastDueDate: CalendarDate | null
  startDate: CalendarDate
  today: CalendarDate
}): CalendarDate {
  const earliest = lastDueDate ? startOfNextPeriod(from.frequency, lastDueDate) : startDate
  return firstDueDateFrom(to, earliest > today ? earliest : today)
}

export function sameSchedule(a: Schedule, b: Schedule): boolean {
  switch (a.frequency) {
    case 'weekly':
      return b.frequency === 'weekly' && a.weekday === b.weekday
    case 'monthly':
      return b.frequency === 'monthly' && a.day === b.day
    case 'yearly':
      return b.frequency === 'yearly' && a.month === b.month && a.day === b.day
  }
}

// 29 Feb is allowed, as it falls back to 28 Feb in a year without one.
const LEAP_YEAR = 2000

export const scheduleSchema = z.discriminatedUnion(
  'frequency',
  [
    z.object({ frequency: z.literal('monthly'), day: z.int().min(1).max(31, 'Choose a day of the month') }),
    z.object({ frequency: z.literal('weekly'), weekday: z.int().min(1).max(7, 'Choose a weekday') }),
    z
      .object({ frequency: z.literal('yearly'), month: z.int().min(1).max(12), day: z.int().min(1).max(31) })
      .refine(({ month, day }) => day <= daysInMonth(LEAP_YEAR, month), {
        error: 'That month doesn’t have that day',
        path: ['day'],
      }),
  ],
  { error: 'Choose how often it’s due' },
)

// When a new Recurring Transaction starts: from today up to a Transaction's
// latest date, in the user's time zone, so nothing is ever backfilled.
export function recurringStartSchema(timeZone: string, now: Date = new Date()) {
  const today = todayIn(timeZone, now)
  return transactionDateSchema(timeZone, now).refine((date) => date >= today, 'Start today or later')
}

// What the API takes to add a Recurring Transaction for a user in `timeZone`.
// When the amount varies, each Transaction it creates is an Estimate holding
// the amount as its guess.
export function newRecurringSchema(timeZone: string, now: Date = new Date()) {
  return z.object({
    categoryId: categoryIdSchema,
    amount: amountSchema,
    note: noteSchema,
    varies: z.boolean(),
    schedule: scheduleSchema,
    startDate: recurringStartSchema(timeZone, now),
  })
}

export type NewRecurring = z.output<ReturnType<typeof newRecurringSchema>>

// What the API takes to edit one: any of its fields but the start date. A
// field left out stays as it was; a blank or null note removes the note.
export const recurringChangesSchema = z
  .object({
    categoryId: categoryIdSchema,
    amount: amountSchema,
    note: noteSchema,
    varies: z.boolean(),
    schedule: scheduleSchema,
  })
  .partial()

export type RecurringChanges = z.output<typeof recurringChangesSchema>

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

// "Monday" for 1 through "Sunday" for 7.
export function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday - 1]!
}

const longMonth = new Intl.DateTimeFormat('en-MY', { month: 'long', timeZone: 'UTC' })
const shortDayMonth = new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short', timeZone: 'UTC' })

// "January" for 1 through "December" for 12.
export function monthName(month: number): string {
  return longMonth.format(utcMidnight(toCalendarDate(LEAP_YEAR, month, 1)))
}

// "1st", "2nd", "3rd", "11th", "22nd".
export function ordinal(day: number): string {
  const tens = day % 100
  if (tens >= 11 && tens <= 13) return `${day}th`
  return `${day}${{ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th'}`
}

// "Every month on the 25th", "Every Monday", "Every year on 29 Feb".
export function formatSchedule(schedule: Schedule): string {
  switch (schedule.frequency) {
    case 'monthly':
      return `Every month on the ${ordinal(schedule.day)}`
    case 'weekly':
      return `Every ${weekdayName(schedule.weekday)}`
    case 'yearly': {
      const date = toCalendarDate(LEAP_YEAR, schedule.month, schedule.day)
      return `Every year on ${shortDayMonth.format(utcMidnight(date))}`
    }
  }
}
